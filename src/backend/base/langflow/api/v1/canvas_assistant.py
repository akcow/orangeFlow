from __future__ import annotations

import asyncio
import base64
import hashlib
import ipaddress
import json
import os
import re
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from lfx.utils.provider_credentials import get_provider_credentials

from langflow.api.v1.access import require_flow_access
from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.api.v1.schemas import StreamData
from langflow.services.database.models.flow.model import Flow
from langflow.services.deps import get_settings_service
from langflow.services.deps import get_storage_service
from langflow.services.storage.service import StorageService


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


def _extract_json_codeblock_or_raw(text: str) -> str | None:
    """Best-effort extract JSON object string from a model response."""
    raw = str(text or "")
    if not raw.strip():
        return None
    m = re.search(r"```json\s*([\s\S]*?)\s*```", raw, re.IGNORECASE)
    if m and m.group(1).strip():
        return m.group(1).strip()
    # Fallback: if the whole text looks like JSON, try it.
    s = raw.strip()
    if s.startswith("{") and s.endswith("}"):
        return s
    return None


def _utc_ts_prefix() -> str:
    return datetime.now(tz=timezone.utc).astimezone().strftime("%Y-%m-%d_%H-%M-%S")


def _sanitize_filename(name: str) -> str:
    # Prevent path traversal / nested paths / Windows-invalid filenames.
    base = Path(str(name or "")).name
    base = re.sub(r'[<>:"/\\\\|?*\\x00-\\x1F]', "_", base).strip().strip(".")
    return base or "inspiration_image"


def _inspiration_cache_dir() -> Path:
    # Prefer explicit env var, otherwise store under config dir.
    env_dir = os.getenv("CANVAS_ASSISTANT_INSPIRATION_CACHE_DIR", "").strip()
    if env_dir:
        p = Path(env_dir).expanduser()
        p.mkdir(parents=True, exist_ok=True)
        return p
    settings_service = get_settings_service()
    base = Path(settings_service.settings.config_dir) / "cache" / "canvas_assistant_inspiration"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _meta_path(image_id: str) -> Path:
    return _inspiration_cache_dir() / "meta" / f"{image_id}.json"


def _blob_path(image_id: str, variant: str) -> Path:
    return _inspiration_cache_dir() / "blobs" / variant / image_id


def _is_public_http_url(url: str) -> bool:
    try:
        u = urlparse(str(url or ""))
    except Exception:
        return False
    if u.scheme not in ("http", "https"):
        return False
    if not u.netloc:
        return False
    host = (u.hostname or "").strip().lower()
    if not host or host in ("localhost",):
        return False
    if host.endswith(".local"):
        return False
    # Block direct IPs that are not public.
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    except ValueError:
        # Domain - resolve and check.
        try:
            infos = socket.getaddrinfo(host, None)
            for info in infos:
                addr = info[4][0]
                try:
                    ip = ipaddress.ip_address(addr)
                    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                        return False
                except Exception:
                    continue
        except Exception:
            # DNS failures treated as non-public.
            return False
    return True


_INSPIRATION_PROXY_FETCH_SEM = asyncio.Semaphore(
    int(os.getenv("CANVAS_ASSISTANT_INSPIRATION_PROXY_CONCURRENCY", "10"))
)


async def _download_image_bytes(
    *,
    url: str,
    max_bytes: int,
) -> tuple[bytes, str]:
    if not _is_public_http_url(url):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="图片 URL 不安全或无效。")

    headers = {
        "User-Agent": "Langflow-CanvasAssistant/1.0",
        "Accept": "image/*,*/*;q=0.8",
    }
    timeout = httpx.Timeout(30.0)
    async with _INSPIRATION_PROXY_FETCH_SEM:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            async with client.stream("GET", url, headers=headers) as resp:
                if resp.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"图片上游返回 HTTP {resp.status_code}",
                    )
                content_type = (resp.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
                if not content_type.startswith("image/"):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="上游内容不是图片。",
                    )
                buf = bytearray()
                async for chunk in resp.aiter_bytes():
                    if not chunk:
                        continue
                    buf.extend(chunk)
                    if len(buf) > max_bytes:
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail="图片过大，已超过限制。",
                        )
                return bytes(buf), content_type or "image/jpeg"


def _read_meta(image_id: str) -> dict | None:
    p = _meta_path(image_id)
    try:
        if not p.exists():
            return None
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_meta(image_id: str, data: dict) -> None:
    base = _meta_path(image_id).parent
    base.mkdir(parents=True, exist_ok=True)
    tmp = _meta_path(image_id).with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(_meta_path(image_id))


async def _ensure_cached_blob(
    *,
    image_id: str,
    variant: Literal["thumb", "full"],
    url: str,
    max_bytes: int,
) -> tuple[bytes, str]:
    p = _blob_path(image_id, variant)
    p.parent.mkdir(parents=True, exist_ok=True)
    meta = _read_meta(image_id) or {}
    content_type_key = f"{variant}_content_type"

    if p.exists():
        try:
            data = p.read_bytes()
            ct = str(meta.get(content_type_key) or "").strip() or "image/jpeg"
            return data, ct
        except Exception:
            # fall through to re-download
            pass

    data, ct = await _download_image_bytes(url=url, max_bytes=max_bytes)
    try:
        p.write_bytes(data)
    except Exception:
        # If disk write fails, still serve the bytes.
        return data, ct

    meta[content_type_key] = ct
    _write_meta(image_id, meta)
    return data, ct


async def _get_flow_for_user(
    flow_id: UUID,
    user: CurrentActiveUser,
    session: DbSession,
) -> Flow:
    return await require_flow_access(session, flow_id, user)


class InspirationImage(BaseModel):
    id: str
    title: str | None = None
    source_url: str
    source_page_url: str | None = None
    domain: str | None = None
    width: int | None = None
    height: int | None = None
    thumbnail_width: int | None = None
    thumbnail_height: int | None = None
    thumb_url: str
    full_url: str
    analysis: dict | None = None


class InspirationSearchRequest(BaseModel):
    query: str = Field(default="", description="Search query")
    model: str = Field(default="gemini-3-flash-preview", description="Gemini model id used for tool calling")
    count: int = Field(default=50, ge=1, le=50)


class InspirationSearchResponse(BaseModel):
    type: Literal["inspiration_images"] = "inspiration_images"
    mode: Literal["film"] = "film"
    query: str
    count: int
    images: list[InspirationImage]


class InspirationAnalyzeRequest(BaseModel):
    image_id: str


class InspirationAnalyzeResponse(BaseModel):
    image_id: str
    analysis: dict


class InspirationApplyRequest(BaseModel):
    image_id: str


class InspirationApplyResponse(BaseModel):
    flow_id: str
    file_path: str
    original_name: str
    stored_name: str


async def _bing_image_search(*, query: str, count: int) -> list[dict]:
    key = (os.getenv("BING_IMAGE_SEARCH_KEY") or "").strip()
    if not key:
        # Use 5xx so frontend auth-refresh interceptors don't treat it as login failure.
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="未配置 Bing Image Search Key。")
    endpoint = (os.getenv("BING_IMAGE_SEARCH_ENDPOINT") or "https://api.bing.microsoft.com/v7.0/images/search").strip()
    headers = {"Ocp-Apim-Subscription-Key": key}
    params = {
        "q": query,
        "count": count,
        "safeSearch": "Moderate",
        "imageType": "Photo",
    }
    timeout = httpx.Timeout(30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(endpoint, headers=headers, params=params)
        if resp.status_code != 200:
            detail = ""
            try:
                data = resp.json()
                detail = str((data.get("error") or {}).get("message") or data.get("message") or "").strip()
            except Exception:
                detail = ""
            if not detail:
                body = (resp.text or "").strip()
                detail = f"Bing 上游返回 HTTP {resp.status_code}" + (f": {body[:500]}" if body else "")
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)
        data = resp.json()
        items = data.get("value") or []
        return items if isinstance(items, list) else []


def _extract_first_function_call(payload: object) -> tuple[str | None, dict | None, str | None]:
    """Return (name, args, thought_signature) for the first function call part."""
    if not isinstance(payload, dict):
        return None, None, None
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return None, None, None
    content = (candidates[0] or {}).get("content")
    if not isinstance(content, dict):
        return None, None, None
    parts = content.get("parts")
    if not isinstance(parts, list):
        return None, None, None

    for part in parts:
        if not isinstance(part, dict):
            continue
        fc = part.get("functionCall") or part.get("function_call")
        if not isinstance(fc, dict):
            continue
        name = fc.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        args = fc.get("args")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except Exception:
                args = None
        if args is not None and not isinstance(args, dict):
            args = None
        sig = part.get("thoughtSignature") or part.get("thought_signature")
        sig = sig.strip() if isinstance(sig, str) and sig.strip() else None
        return name.strip(), args, sig
    return None, None, None


async def _gemini_request_json(
    *,
    model: str,
    req_body: dict,
) -> dict:
    api_key = _resolve_gemini_api_key()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="未配置 Gemini API Key。")

    base_url = (
        os.getenv("GEMINI_API_BASE")
        or os.getenv("GEMINI_API_BASE_URL")
        or "https://cdn.12ai.org/v1beta"
    ).rstrip("/")

    url = f"{base_url}/models/{model}:generateContent"
    params = {"key": api_key}
    headers = {"Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, params=params, json=req_body)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"上游请求失败: {exc}") from exc

    if resp.status_code != 200:
        detail = ""
        try:
            detail = _extract_gemini_error(resp.json())
        except Exception:
            detail = ""
        if not detail:
            body = (resp.text or "").strip()
            detail = f"Gemini 上游返回 HTTP {resp.status_code}" + (f": {body[:500]}" if body else "")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)
    data = resp.json()
    return data if isinstance(data, dict) else {}


@router.post("/inspiration/search", response_model=InspirationSearchResponse)
async def inspiration_search(
    payload: InspirationSearchRequest,
    _: CurrentActiveUser,
) -> InspirationSearchResponse:
    query = str(payload.query or "").strip()
    if not query:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="query 不能为空。")
    count = int(payload.count or 50)

    # Prefer tool-calling flow (Gemini function calling) so "联网/检索" is expressed via tools.
    # Fallback to direct Bing call if upstream doesn't support tool calling or refuses to call the tool.
    model = str(payload.model or "").strip() or "gemini-3-flash-preview"
    if not model.startswith("gemini-"):
        model = "gemini-3-flash-preview"
    picked_query = query
    picked_count = count
    items: list[dict] = []

    # Ask Gemini to call the tool (best-effort). This allows it to rewrite/expand the user's description
    # into a better image search query when needed. If tool calling isn't supported upstream, we fall back.
    try:
        tool_req = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                "你是电影镜头灵感图片检索助手。\n"
                                "请根据用户描述，调用工具 bing_image_search 进行联网图片搜索。\n"
                                "要求：count 固定为 50；query 用中文短语为主，可补充少量英文专业词（如 noir, wide angle）。\n"
                                f"用户描述：{query}"
                            )
                        }
                    ],
                }
            ],
            "tools": [
                {
                    "functionDeclarations": [
                        {
                            "name": "bing_image_search",
                            "description": "Search for relevant cinematic still images using Bing Image Search.",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "query": {"type": "string", "description": "Search query"},
                                    "count": {"type": "integer", "description": "Number of images (max 50)"},
                                },
                                "required": ["query", "count"],
                            },
                        }
                    ]
                }
            ],
            "toolConfig": {"functionCallingConfig": {"mode": "auto"}},
            "generationConfig": {"temperature": 0.2},
        }

        tool_resp = await _gemini_request_json(model=model, req_body=tool_req)
        fn_name, fn_args, _sig = _extract_first_function_call(tool_resp)
        if fn_name == "bing_image_search" and isinstance(fn_args, dict):
            q2 = str(fn_args.get("query") or "").strip()
            c2 = fn_args.get("count")
            if q2:
                picked_query = q2
            try:
                c2i = int(c2)
                if 1 <= c2i <= 50:
                    picked_count = c2i
            except Exception:
                pass

    except Exception:
        # Ignore tool calling failures and fall back.
        picked_query = query
        picked_count = count

    items = await _bing_image_search(query=picked_query, count=picked_count)

    thumb_max_bytes = int(os.getenv("CANVAS_ASSISTANT_INSPIRATION_THUMB_MAX_BYTES", str(3 * 1024 * 1024)))

    images: list[InspirationImage] = []
    to_prefetch: list[tuple[str, str]] = []
    for it in items[:count]:
        content_url = str(it.get("contentUrl") or "").strip()
        thumb_url = str(it.get("thumbnailUrl") or "").strip()
        if not content_url or not thumb_url:
            continue
        image_id = hashlib.sha256(content_url.encode("utf-8")).hexdigest()
        host_page_url = str(it.get("hostPageUrl") or "").strip() or None
        domain = None
        try:
            if host_page_url:
                domain = urlparse(host_page_url).hostname
        except Exception:
            domain = None

        meta = _read_meta(image_id) or {}
        meta.update(
            {
                "id": image_id,
                "content_url": content_url,
                "thumbnail_url": thumb_url,
                "host_page_url": host_page_url,
                "title": str(it.get("name") or "").strip() or None,
                "search_query_user": query,
                "search_query_used": picked_query,
                "width": int(it.get("width") or 0) or None,
                "height": int(it.get("height") or 0) or None,
                "thumbnail_width": int((it.get("thumbnail") or {}).get("width") or 0) or None,
                "thumbnail_height": int((it.get("thumbnail") or {}).get("height") or 0) or None,
                "domain": domain,
                "updated_at": datetime.now(tz=timezone.utc).isoformat(),
            }
        )
        if "created_at" not in meta:
            meta["created_at"] = datetime.now(tz=timezone.utc).isoformat()
        _write_meta(image_id, meta)

        to_prefetch.append((image_id, thumb_url))

        images.append(
            InspirationImage(
                id=image_id,
                title=meta.get("title"),
                source_url=content_url,
                source_page_url=host_page_url,
                domain=domain,
                width=meta.get("width"),
                height=meta.get("height"),
                thumbnail_width=meta.get("thumbnail_width"),
                thumbnail_height=meta.get("thumbnail_height"),
                thumb_url=f"/api/v1/canvas-assistant/inspiration/image/{image_id}/thumb",
                full_url=f"/api/v1/canvas-assistant/inspiration/image/{image_id}/full",
                analysis=meta.get("analysis") if isinstance(meta.get("analysis"), dict) else None,
            )
        )

    # Prefetch thumbnails (best effort) so the grid is fast and avoids anti-hotlinking.
    sem = asyncio.Semaphore(int(os.getenv("CANVAS_ASSISTANT_INSPIRATION_THUMB_PREFETCH_CONCURRENCY", "8")))

    async def prefetch_one(image_id: str, url: str) -> None:
        async with sem:
            try:
                await _ensure_cached_blob(
                    image_id=image_id, variant="thumb", url=url, max_bytes=thumb_max_bytes
                )
            except Exception:
                return

    # Prefetch only the first batch to keep latency low; the rest is fetched on demand by the proxy endpoint.
    await asyncio.gather(*[prefetch_one(i, u) for i, u in to_prefetch[:12]], return_exceptions=True)

    # Return the original user query for UI continuity; also keep the actual query in meta for debugging.
    return InspirationSearchResponse(query=query, count=len(images), images=images)


@router.get("/inspiration/image/{image_id}/{variant}")
async def inspiration_image_proxy(
    image_id: str,
    variant: Literal["thumb", "full"],
) -> Response:
    meta = _read_meta(image_id)
    if not meta:
        raise HTTPException(status_code=404, detail="图片不存在或缓存已过期。")

    url_key = "thumbnail_url" if variant == "thumb" else "content_url"
    url = str(meta.get(url_key) or "").strip()
    if not url:
        raise HTTPException(status_code=404, detail="图片源地址缺失。")

    max_bytes_env = (
        "CANVAS_ASSISTANT_INSPIRATION_THUMB_MAX_BYTES"
        if variant == "thumb"
        else "CANVAS_ASSISTANT_INSPIRATION_FULL_MAX_BYTES"
    )
    max_bytes_default = 3 * 1024 * 1024 if variant == "thumb" else 12 * 1024 * 1024
    max_bytes = int(os.getenv(max_bytes_env, str(max_bytes_default)))

    data, ct = await _ensure_cached_blob(image_id=image_id, variant=variant, url=url, max_bytes=max_bytes)
    headers = {
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
    }
    return Response(content=data, media_type=ct, headers=headers)


@router.post("/inspiration/analyze", response_model=InspirationAnalyzeResponse)
async def inspiration_analyze(
    payload: InspirationAnalyzeRequest,
    _: CurrentActiveUser,
) -> InspirationAnalyzeResponse:
    image_id = str(payload.image_id or "").strip()
    if not image_id:
        raise HTTPException(status_code=400, detail="image_id 不能为空。")
    meta = _read_meta(image_id)
    if not meta:
        raise HTTPException(status_code=404, detail="图片不存在或缓存已过期。")

    cached = meta.get("analysis")
    if isinstance(cached, dict) and cached:
        return InspirationAnalyzeResponse(image_id=image_id, analysis=cached)

    api_key = _resolve_gemini_api_key()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="未配置 Gemini API Key。")

    base_url = (
        os.getenv("GEMINI_API_BASE")
        or os.getenv("GEMINI_API_BASE_URL")
        or "https://cdn.12ai.org/v1beta"
    ).rstrip("/")
    # Align with the Canvas Assistant selectable models by default.
    model = (os.getenv("CANVAS_ASSISTANT_INSPIRATION_VISION_MODEL") or "gemini-3-flash-preview").strip()

    full_url = str(meta.get("content_url") or "").strip()
    full_max_bytes = int(os.getenv("CANVAS_ASSISTANT_INSPIRATION_FULL_MAX_BYTES", str(12 * 1024 * 1024)))
    data, ct = await _ensure_cached_blob(image_id=image_id, variant="full", url=full_url, max_bytes=full_max_bytes)
    data_b64 = base64.b64encode(data).decode("ascii")

    prompt = (
        "你是专业影视摄影分析助手。请基于给定图片做“电影镜头”分析，并只输出 JSON（不要输出任何多余文字）。\n"
        "字段要求（尽量填满，无法判断可填 null）：\n"
        "- color_temp: \"Warm\" | \"Cool\" | \"Neutral\"\n"
        "- aspect_ratio: 例如 \"2.39:1\"、\"16:9\"、\"9:16\"、\"1:1\"\n"
        "- shot_size: 例如 \"Long Shot\"/\"Medium\"/\"Close Up\"/\"Extreme Close Up\"\n"
        "- camera_angle: 例如 \"Eye-level\"/\"High Angle\"/\"Low Angle\"/\"Top-down\"/\"Dutch\"\n"
        "- lens_size: 例如 \"Wide\"/\"Medium\"/\"Tele\"（可结合画面观感给出）\n"
        "- depth_of_field: \"Shallow\" | \"Medium\" | \"Deep\"\n"
        "- lighting_type: 例如 \"Daylight\"/\"Golden Hour\"/\"Night\"/\"Indoor\"/\"Backlit\"\n"
        "- time_of_day: 例如 \"Day\"/\"Sunset\"/\"Night\"\n"
        "- subject_count: number\n"
        "- subject_type: 例如 \"Human\"/\"Animal\"/\"Object\"/\"Landscape\"\n"
        "- color_palette: 主色调数组（hex），最多 6 个\n"
    )

    req_body: dict = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {"inlineData": {"mimeType": ct, "data": data_b64}},
                ],
            }
        ],
        "generationConfig": {"temperature": 0.2},
    }

    url = f"{base_url}/models/{model}:generateContent"
    params = {"key": api_key}
    headers = {"Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, params=params, json=req_body)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"上游请求失败: {exc}") from exc

    if resp.status_code != 200:
        detail = ""
        try:
            detail = _extract_gemini_error(resp.json())
        except Exception:
            detail = ""
        if not detail:
            body = (resp.text or "").strip()
            detail = f"Gemini 上游返回 HTTP {resp.status_code}" + (f": {body[:500]}" if body else "")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    text = _extract_gemini_text(resp.json())
    raw_json = _extract_json_codeblock_or_raw(text)
    if not raw_json:
        raise HTTPException(status_code=502, detail="Gemini 未返回可解析的 JSON。")
    try:
        analysis = json.loads(raw_json)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Gemini 返回的 JSON 无法解析。") from exc
    if not isinstance(analysis, dict):
        raise HTTPException(status_code=502, detail="Gemini 返回的分析结果格式不正确。")

    meta["analysis"] = analysis
    meta["analysis_updated_at"] = datetime.now(tz=timezone.utc).isoformat()
    _write_meta(image_id, meta)
    return InspirationAnalyzeResponse(image_id=image_id, analysis=analysis)


@router.post("/inspiration/apply/{flow_id}", response_model=InspirationApplyResponse)
async def inspiration_apply(
    flow_id: UUID,
    payload: InspirationApplyRequest,
    user: CurrentActiveUser,
    session: DbSession,
    storage_service: StorageService = Depends(get_storage_service),
    settings_service=Depends(get_settings_service),
) -> InspirationApplyResponse:
    image_id = str(payload.image_id or "").strip()
    if not image_id:
        raise HTTPException(status_code=400, detail="image_id 不能为空。")
    flow = await _get_flow_for_user(flow_id, user, session)

    meta = _read_meta(image_id)
    if not meta:
        raise HTTPException(status_code=404, detail="图片不存在或缓存已过期。")

    full_url = str(meta.get("content_url") or "").strip()
    full_max_bytes = int(os.getenv("CANVAS_ASSISTANT_INSPIRATION_FULL_MAX_BYTES", str(12 * 1024 * 1024)))
    data, ct = await _ensure_cached_blob(image_id=image_id, variant="full", url=full_url, max_bytes=full_max_bytes)

    try:
        max_mb = float(settings_service.settings.max_file_size_upload)
    except Exception:
        max_mb = 0
    if max_mb and len(data) > int(max_mb * 1024 * 1024):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"图片过大，已超过最大上传限制（{max_mb}MB）。",
        )

    # Determine extension from content type; keep minimal mapping.
    ext = "jpg"
    if ct.endswith("png"):
        ext = "png"
    elif ct.endswith("webp"):
        ext = "webp"
    elif ct.endswith("gif"):
        ext = "gif"

    original_name = _sanitize_filename(str(meta.get("title") or f"inspiration_{image_id[:12]}.{ext}"))
    if "." not in original_name:
        original_name = f"{original_name}.{ext}"

    stored_name = f"{_utc_ts_prefix()}_{original_name}"
    folder = str(flow.id)
    await storage_service.save_file(flow_id=folder, file_name=stored_name, data=data)
    file_path = f"{folder}/{stored_name}"
    return InspirationApplyResponse(flow_id=folder, file_path=file_path, original_name=original_name, stored_name=stored_name)


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
