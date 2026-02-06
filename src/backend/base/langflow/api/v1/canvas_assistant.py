from __future__ import annotations

import os
import base64
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from lfx.utils.provider_credentials import get_provider_credentials

from langflow.api.utils import CurrentActiveUser
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
