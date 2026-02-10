from __future__ import annotations

import os
import base64
import json
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from lfx.utils.provider_credentials import get_provider_credentials

from langflow.api.utils import CurrentActiveUser
from langflow.api.v1.schemas import StreamData
from langflow.services.deps import get_settings_service


router = APIRouter(prefix="/canvas-assistant", tags=["Canvas Assistant"])


class CanvasAssistantAttachment(BaseModel):
    name: str = Field(default="", description="Original file name")
    mimeType: str = Field(default="", description="Mime type, e.g. image/png, video/mp4")
    size: int = Field(default=0, ge=0, description="Original file size in bytes")
    dataBase64: str = Field(default="", description="Base64-encoded data (no data: prefix)")


class CanvasAssistantMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(default="", description="Plain text message content")
    attachments: list[CanvasAssistantAttachment] | None = Field(
        default=None,
        description="Optional image/video attachments (base64 inlineData) for this message.",
    )


class CanvasAssistantChatRequest(BaseModel):
    model: str = Field(default="gemini-3-pro-preview", description="Gemini model id")
    messages: list[CanvasAssistantMessage] = Field(default_factory=list)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)


class CanvasAssistantChatResponse(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str


def _normalize_key(value: str | None) -> str | None:
    if not value:
        return None
    v = str(value).strip().strip("'").strip('"')
    if not v:
        return None
    if v.lower().startswith("bearer "):
        v = v.split(" ", 1)[1].strip()
    if v.startswith("****"):
        return None
    v = "".join(v.split())
    return v or None


def _resolve_gemini_api_key() -> str | None:
    """Resolve Gemini API key using the same priority as LFX components.

    Priority:
      1) Provider Credentials: gemini -> google (do not use default provider)
      2) ENV: GEMINI_API_KEY -> GOOGLE_API_KEY
    """
    try:  # pragma: no cover - runtime dependency
        settings_service = get_settings_service()
        config_dir = settings_service.settings.config_dir

        gemini_creds = get_provider_credentials("gemini", config_dir)
        key = _normalize_key(getattr(gemini_creds, "api_key", None))
        if key:
            return key

        google_creds = get_provider_credentials("google", config_dir)
        key = _normalize_key(getattr(google_creds, "api_key", None))
        if key:
            return key
    except Exception:
        # Fall back to env vars.
        pass

    for env_var in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        key = _normalize_key(os.getenv(env_var))
        if key:
            return key
    return None


def _extract_gemini_text(payload: object) -> str:
    if not isinstance(payload, dict):
        return ""
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    first = candidates[0]
    if not isinstance(first, dict):
        return ""
    content = first.get("content")
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""

    texts: list[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        # Skip "thought" parts when present.
        if part.get("thought") is True:
            continue
        text = part.get("text")
        if isinstance(text, str) and text.strip():
            texts.append(text.strip())

    return "\n".join(texts).strip()


def _extract_gemini_error(payload: object) -> str:
    # Gemini error shape usually: {"error":{"message":...}}
    if not isinstance(payload, dict):
        return ""
    err = payload.get("error")
    if isinstance(err, dict):
        msg = err.get("message")
        if isinstance(msg, str) and msg.strip():
            return msg.strip()
    msg = payload.get("message")
    if isinstance(msg, str) and msg.strip():
        return msg.strip()
    return ""


async def _stream_gemini_sse(
    *,
    url: str,
    headers: dict,
    params: dict,
    req_json: dict,
) -> object:
    """Yield StreamData SSE events with {"chunk": "..."} payloads."""
    emitted_any = False
    error_detail: str | None = None
    try:
        # Streaming responses can be long; avoid a strict read timeout.
        timeout = httpx.Timeout(60.0, read=None)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, headers=headers, params=params, json=req_json) as resp:
                if resp.status_code != 200:
                    detail = ""
                    try:
                        data = await resp.json()
                        detail = _extract_gemini_error(data)
                    except Exception:
                        detail = ""
                    if not detail:
                        body = (await resp.aread()).decode("utf-8", errors="replace").strip()
                        detail = f"Gemini 上游返回 HTTP {resp.status_code}" + (f": {body[:500]}" if body else "")
                    error_detail = detail
                    return

                # The upstream uses SSE frames. We parse full frames (event + data lines) and
                # re-emit only text chunks. Some Gemini deployments may send the full accumulated
                # text each frame; we de-duplicate by emitting only the delta suffix.
                block_lines: list[str] = []
                last_text = ""

                def parse_frame(raw: str) -> tuple[bool, str | None]:
                    nonlocal last_text
                    raw = raw.strip()
                    if not raw:
                        return False, None
                    if raw == "[DONE]":
                        return True, None
                    try:
                        payload = json.loads(raw)
                    except Exception:
                        return False, None

                    text = _extract_gemini_text(payload)
                    if not text:
                        return False, None

                    if last_text and text.startswith(last_text):
                        delta = text[len(last_text) :]
                    else:
                        delta = text
                    last_text = text
                    return False, (delta or None)

                def parse_sse_block(lines: list[str]) -> tuple[bool, str | None]:
                    """Parse an SSE block and return (done, delta_text).

                    Be tolerant of upstream/proxy formatting: if JSON is pretty-printed
                    across multiple lines without repeating `data:`, we treat subsequent
                    non-prefixed lines as continuation.
                    """
                    data_chunks: list[str] = []
                    for ln in lines:
                        if not ln:
                            continue
                        if ln.startswith("event:"):
                            continue
                        if ln.startswith(":"):
                            # comment line
                            continue
                        if ln.startswith("data:"):
                            data_chunks.append(ln.split(":", 1)[1].lstrip())
                            continue
                        # Non-standard continuation (pretty JSON etc.)
                        if data_chunks:
                            data_chunks.append(ln)
                    raw = "\n".join(data_chunks).strip()
                    return parse_frame(raw)

                async for line in resp.aiter_lines():
                    # Blank line separates SSE blocks.
                    if line == "":
                        if not block_lines:
                            continue
                        done, delta = parse_sse_block(block_lines)
                        block_lines.clear()

                        if delta:
                            emitted_any = True
                            yield str(StreamData(event="message", data={"chunk": delta}))
                        if done:
                            break
                        continue

                    block_lines.append(line)

                # Flush any final frame (in case the stream ends without a trailing blank line).
                if block_lines:
                    done, delta = parse_sse_block(block_lines)
                    if delta:
                        emitted_any = True
                        yield str(StreamData(event="message", data={"chunk": delta}))
                    if done:
                        return
    except httpx.RequestError as exc:
        # Don't emit an error event immediately; we may still be able to fall back to a
        # non-streaming request, and the frontend currently treats `event:error` as fatal.
        error_detail = f"上游请求失败: {exc}"
    finally:
        # If we couldn't parse any streamed content, fall back to a non-streaming request
        # so the UI doesn't show "empty reply" even when upstream did generate content.
        if not emitted_any:
            try:
                timeout = httpx.Timeout(60.0)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    fallback_url = url.replace(":streamGenerateContent", ":generateContent")
                    fallback_params = {k: v for k, v in (params or {}).items() if k != "alt"}
                    fallback_resp = await client.post(
                        fallback_url, headers=headers, params=fallback_params, json=req_json
                    )
                    if fallback_resp.status_code == 200:
                        payload = fallback_resp.json()
                        text = _extract_gemini_text(payload)
                        if text:
                            yield str(StreamData(event="message", data={"chunk": text}))
                        else:
                            yield str(
                                StreamData(
                                    event="error",
                                    data={"error": error_detail or "模型返回为空。"},
                                )
                            )
                    else:
                        detail = ""
                        try:
                            detail = _extract_gemini_error(fallback_resp.json())
                        except Exception:
                            detail = fallback_resp.text[:500] if fallback_resp.text else ""
                        yield str(
                            StreamData(
                                event="error",
                                data={
                                    "error": detail
                                    or error_detail
                                    or f"Gemini 上游返回 HTTP {fallback_resp.status_code}"
                                },
                            )
                        )
            except Exception:
                # If even the fallback can't be reached, surface the original request error.
                yield str(
                    StreamData(
                        event="error",
                        data={"error": error_detail or "上游请求失败。"},
                    )
                )
        yield str(StreamData(event="close", data={"message": "Stream closed"}))


@router.post("/chat", response_model=CanvasAssistantChatResponse)
async def canvas_assistant_chat(
    payload: CanvasAssistantChatRequest,
    _: CurrentActiveUser,
) -> CanvasAssistantChatResponse:
    model = (payload.model or "").strip()
    if not model.startswith("gemini-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 gemini-* 文本模型。",
        )

    api_key = _resolve_gemini_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            # Keep error copy minimal; UI should not force a specific settings path.
            detail="未配置 Gemini API Key。",
        )

    base_url = (
        os.getenv("GEMINI_API_BASE")
        or os.getenv("GEMINI_API_BASE_URL")
        or "https://cdn.12ai.org/v1beta"
    ).rstrip("/")

    system_texts = [m.content.strip() for m in payload.messages if m.role == "system" and m.content.strip()]
    system_text = "\n".join(system_texts).strip() if system_texts else None

    # Guardrails: keep requests reasonably sized.
    max_attachment_bytes = int(os.getenv("CANVAS_ASSISTANT_MAX_ATTACHMENT_BYTES", str(15 * 1024 * 1024)))
    max_total_attachment_bytes = int(os.getenv("CANVAS_ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES", str(25 * 1024 * 1024)))

    contents: list[dict] = []
    total_attachment_bytes = 0
    for msg in payload.messages:
        if msg.role == "system":
            continue
        text = (msg.content or "").strip()
        attachments = msg.attachments or []
        parts: list[dict] = []

        for att in attachments:
            mime = (att.mimeType or "").strip()
            if not (mime.startswith("image/") or mime.startswith("video/")):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="仅支持图片/视频附件（image/*, video/*）。",
                )

            # Prefer the declared size when provided, but verify decoded size too.
            declared_size = int(att.size or 0)
            if declared_size > max_attachment_bytes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"单个附件过大（>{max_attachment_bytes} bytes）。",
                )

            data_b64 = _normalize_key(att.dataBase64) or ""
            if not data_b64:
                continue
            try:
                decoded = base64.b64decode(data_b64, validate=True)
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="附件 base64 数据无效。",
                ) from exc

            decoded_size = len(decoded)
            if decoded_size > max_attachment_bytes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"单个附件过大（>{max_attachment_bytes} bytes）。",
                )
            total_attachment_bytes += decoded_size
            if total_attachment_bytes > max_total_attachment_bytes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"附件总大小超过上限（>{max_total_attachment_bytes} bytes）。",
                )

            # Gemini inlineData expects base64 string.
            parts.append({"inlineData": {"mimeType": mime, "data": data_b64}})

        if text:
            parts.append({"text": text})
        if not parts:
            continue
        role = "user" if msg.role == "user" else "model"
        contents.append({"role": role, "parts": parts})

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="消息不能为空。",
        )

    req_body: dict = {
        "contents": contents,
        "generationConfig": {
            "temperature": payload.temperature if payload.temperature is not None else 0.7,
        },
    }
    if system_text:
        req_body["systemInstruction"] = {"parts": [{"text": system_text}]}

    url = f"{base_url}/models/{model}:generateContent"
    params = {"key": api_key}
    headers = {"Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, params=params, json=req_body)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"上游请求失败: {exc}",
        ) from exc

    if resp.status_code != 200:
        # Gemini error shape usually: {"error":{"message":...}}
        detail = ""
        try:
            data = resp.json()
            if isinstance(data, dict):
                detail = (
                    str((data.get("error") or {}).get("message") or data.get("message") or "")
                ).strip()
        except Exception:
            detail = ""
        if not detail:
            body = (resp.text or "").strip()
            detail = f"Gemini 上游返回 HTTP {resp.status_code}" + (f": {body[:500]}" if body else "")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    data = resp.json()
    text = _extract_gemini_text(data)
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini 响应为空或无法解析文本。",
        )

    return CanvasAssistantChatResponse(content=text)


@router.post("/chat/stream", response_class=StreamingResponse)
async def canvas_assistant_chat_stream(
    payload: CanvasAssistantChatRequest,
    _: CurrentActiveUser,
) -> StreamingResponse:
    """Stream Gemini output as SSE (text/event-stream).

    Each SSE message uses the shared StreamData format:
      event: message
      data: {"chunk":"..."}

    and ends with:
      event: close
    """
    model = (payload.model or "").strip()
    if not model.startswith("gemini-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 gemini-* 文本模型。",
        )

    api_key = _resolve_gemini_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未配置 Gemini API Key。",
        )

    base_url = (
        os.getenv("GEMINI_API_BASE")
        or os.getenv("GEMINI_API_BASE_URL")
        or "https://cdn.12ai.org/v1beta"
    ).rstrip("/")

    system_texts = [m.content.strip() for m in payload.messages if m.role == "system" and m.content.strip()]
    system_text = "\n".join(system_texts).strip() if system_texts else None

    max_attachment_bytes = int(os.getenv("CANVAS_ASSISTANT_MAX_ATTACHMENT_BYTES", str(15 * 1024 * 1024)))
    max_total_attachment_bytes = int(os.getenv("CANVAS_ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES", str(25 * 1024 * 1024)))

    contents: list[dict] = []
    total_attachment_bytes = 0
    for msg in payload.messages:
        if msg.role == "system":
            continue
        text = (msg.content or "").strip()
        attachments = msg.attachments or []
        parts: list[dict] = []

        for att in attachments:
            mime = (att.mimeType or "").strip()
            if not (mime.startswith("image/") or mime.startswith("video/")):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="仅支持图片/视频附件（image/*, video/*）。",
                )

            declared_size = int(att.size or 0)
            if declared_size > max_attachment_bytes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"单个附件过大（>{max_attachment_bytes} bytes）。",
                )

            data_b64 = _normalize_key(att.dataBase64) or ""
            if not data_b64:
                continue
            try:
                decoded = base64.b64decode(data_b64, validate=True)
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="附件 base64 数据无效。",
                ) from exc

            decoded_size = len(decoded)
            if decoded_size > max_attachment_bytes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"单个附件过大（>{max_attachment_bytes} bytes）。",
                )
            total_attachment_bytes += decoded_size
            if total_attachment_bytes > max_total_attachment_bytes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"附件总大小超过上限（>{max_total_attachment_bytes} bytes）。",
                )

            parts.append({"inlineData": {"mimeType": mime, "data": data_b64}})

        if text:
            parts.append({"text": text})
        if not parts:
            continue
        role = "user" if msg.role == "user" else "model"
        contents.append({"role": role, "parts": parts})

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="消息不能为空。",
        )

    req_body: dict = {
        "contents": contents,
        "generationConfig": {
            "temperature": payload.temperature if payload.temperature is not None else 0.7,
        },
    }
    if system_text:
        req_body["systemInstruction"] = {"parts": [{"text": system_text}]}

    url = f"{base_url}/models/{model}:streamGenerateContent"
    params = {"key": api_key, "alt": "sse"}
    headers = {"Content-Type": "application/json"}

    return StreamingResponse(
        _stream_gemini_sse(url=url, headers=headers, params=params, req_json=req_body),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Hint for some reverse proxies (e.g. nginx) to disable response buffering for SSE.
            "X-Accel-Buffering": "no",
        },
    )
