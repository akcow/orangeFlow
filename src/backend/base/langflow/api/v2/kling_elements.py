from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import os
import subprocess
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from typing import Any, Annotated
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import col, select

from langflow.api.schemas import UploadFileResponse
from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.services.database.models.user_asset.model import UserAsset
from langflow.services.deps import get_settings_service, get_storage_service
from langflow.services.settings.service import SettingsService
from langflow.services.storage.service import StorageService

# Persist Kling elements in the same library table as "assets" so they are durable across flows.
KLING_ELEMENTS_CATEGORY = "可灵主体库"


def _now() -> datetime:
    return datetime.now(timezone.utc)


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


def _load_provider_credentials_key(*, providers: list[str]) -> str | None:
    """Read api_key from provider_credentials.json (if present)."""
    try:  # pragma: no cover - runtime dependency
        from langflow.services.deps import get_settings_service
        from lfx.utils.provider_credentials import get_provider_credentials

        settings_service = get_settings_service()
        config_dir = settings_service.settings.config_dir
        for provider in providers:
            creds = get_provider_credentials(provider, config_dir)
            key = _normalize_key(creds.api_key)
            if key:
                return key
    except Exception:
        return None
    return None


def _resolve_kling_api_key() -> str:
    key = _normalize_key(os.getenv("KLING_API_KEY")) or _load_provider_credentials_key(
        providers=["kling", "klingai"]
    )
    if key:
        return key
    # Return 400 (not 401) so the UI doesn't misinterpret it as a login problem.
    raise HTTPException(
        status_code=HTTPStatus.BAD_REQUEST,
        detail="未配置 KLING_API_KEY（或 provider credentials: kling）。请先配置后再创建/删除主体或智能补齐。",
    )


def _resolve_kling_base_url() -> str:
    return str(os.getenv("KLING_API_BASE") or "https://api-beijing.klingai.com").rstrip("/")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _hmac_sig(secret: str, msg: str) -> str:
    return _b64url(hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).digest())


def _file_token_secret(settings_service: SettingsService) -> str:
    # Reuse the app secret key so operators don't need extra config.
    secret = settings_service.auth_settings.SECRET_KEY.get_secret_value()
    if not secret:
        raise HTTPException(status_code=500, detail="Server misconfigured: SECRET_KEY is empty")
    return str(secret)


def _build_public_file_url(
    *,
    request: Request,
    file_id: uuid.UUID,
    settings_service: SettingsService,
    ttl_s: int = 30 * 60,
) -> str:
    expires = int((_now() + timedelta(seconds=int(ttl_s))).timestamp())
    msg = f"{file_id}.{expires}"
    sig = _hmac_sig(_file_token_secret(settings_service), msg)
    base = str(request.base_url).rstrip("/")
    return f"{base}/api/v2/library/kling-elements/public-files/{file_id}?{urlencode({'expires': expires, 'sig': sig})}"


async def _load_file_bytes_as_base64(
    *,
    file_id: uuid.UUID,
    current_user: Any,
    session: Any,
    storage_service: StorageService,
) -> str:
    # Import lazily to avoid heavy deps at module import.
    from langflow.services.database.models.file.model import File as UserFile

    row = await session.get(UserFile, file_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"File not found: {file_id}")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You don't have access to this file")

    filename = str(row.path or "").split("/")[-1]
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid file path")

    # v2 storage uses flow_id = user_id for user files.
    stream = await storage_service.get_file(flow_id=str(current_user.id), file_name=filename)
    if stream is None:
        raise HTTPException(status_code=404, detail="File stream not available")

    # StorageService may return bytes, an async iterator, or a file-like object.
    if isinstance(stream, bytes):
        data = stream
    elif hasattr(stream, "__aiter__"):
        buf = bytearray()
        async for chunk in stream:
            if not isinstance(chunk, (bytes, bytearray)):
                raise HTTPException(status_code=500, detail="Invalid file stream chunk")
            buf.extend(chunk)
        data = bytes(buf)
    elif hasattr(stream, "read"):
        try:
            data = await stream.read()
        except TypeError:
            data = stream.read()
        except Exception:
            # Fall back to sync read if an async read fails.
            data = stream.read()
        if not isinstance(data, (bytes, bytearray)):
            raise HTTPException(status_code=500, detail="Invalid file stream read() result")
        data = bytes(data)
    else:
        raise HTTPException(status_code=500, detail="Unsupported file stream type")

    return base64.b64encode(data).decode("ascii")


async def _load_user_file_for_owner(
    *,
    file_id: uuid.UUID,
    current_user: Any,
    session: Any,
) -> Any:
    # Import lazily to avoid heavy deps at module import.
    from langflow.services.database.models.file.model import File as UserFile

    row = await session.get(UserFile, file_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"File not found: {file_id}")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You don't have access to this file")
    return row


async def _load_user_file_bytes_by_path(
    *,
    file_path: str,
    storage_service: StorageService,
    max_bytes: int | None = None,
) -> bytes:
    if "/" not in (file_path or ""):
        raise HTTPException(status_code=400, detail="Invalid file path")
    prefix, filename = str(file_path).split("/", 1)
    try:
        flow_id = str(uuid.UUID(prefix))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid file path") from exc
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid file path")

    try:
        file_stream = await storage_service.get_file(flow_id=flow_id, file_name=filename)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found") from None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error reading file: {exc}") from exc

    if isinstance(file_stream, bytes):
        data = bytes(file_stream)
    elif hasattr(file_stream, "__aiter__"):
        buf = bytearray()
        async for chunk in file_stream:
            if not isinstance(chunk, (bytes, bytearray)):
                raise HTTPException(status_code=500, detail="Invalid file stream chunk")
            buf.extend(chunk)
            if max_bytes is not None and len(buf) > int(max_bytes):
                raise HTTPException(status_code=413, detail="File too large")
        data = bytes(buf)
    elif hasattr(file_stream, "read"):
        try:
            data = await file_stream.read()
        except TypeError:
            data = file_stream.read()
        if not isinstance(data, (bytes, bytearray)):
            raise HTTPException(status_code=500, detail="Invalid file stream read() result")
        data = bytes(data)
    else:
        raise HTTPException(status_code=500, detail="Unsupported file stream type")

    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    if max_bytes is not None and len(data) > int(max_bytes):
        raise HTTPException(status_code=413, detail="File too large")
    return data


async def _kling_request(
    *,
    method: str,
    path: str,
    json: dict[str, Any] | None = None,
) -> Any:
    api_key = _resolve_kling_api_key()
    base_url = _resolve_kling_base_url()
    url = f"{base_url}{path}"
    headers: dict[str, str] = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.request(method.upper(), url, headers=headers, json=json)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail=f"Kling request failed: {exc}") from exc

    if resp.status_code < 200 or resp.status_code >= 300:
        # Avoid leaking upstream auth codes to the UI (can be mistaken for app login issues).
        if resp.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN):
            raise HTTPException(
                status_code=HTTPStatus.BAD_REQUEST,
                detail="Kling 鉴权失败，请检查 KLING_API_KEY 是否正确。",
            )
        if 400 <= resp.status_code < 500:
            raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail=f"Kling 请求失败：{resp.text}")
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail=f"Kling upstream error: {resp.text}")

    try:
        payload = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail=f"Invalid Kling response: {resp.text}") from exc

    if isinstance(payload, dict) and payload.get("code") not in (None, 0, "0"):
        msg = str(payload.get("message") or payload.get("msg") or "Kling returned error").strip()
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail=msg)

    return payload.get("data") if isinstance(payload, dict) else payload


def _resolve_gemini_api_key() -> str:
    key = (
        _normalize_key(os.getenv("GEMINI_API_KEY"))
        or _normalize_key(os.getenv("GOOGLE_API_KEY"))
        or _load_provider_credentials_key(providers=["gemini", "google"])
    )
    if key:
        return key
    raise HTTPException(
        status_code=HTTPStatus.BAD_REQUEST,
        detail="未配置 GEMINI_API_KEY/GOOGLE_API_KEY（或 provider credentials: gemini/google）。请先配置后再使用智能描述。",
    )


def _resolve_gemini_base_url() -> str:
    # Keep consistent with gateway Gemini provider and canvas_assistant.
    return str(
        os.getenv("GEMINI_API_BASE") or os.getenv("GEMINI_API_BASE_URL") or "https://new.12ai.org/v1beta"
    ).rstrip("/")


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
    if not isinstance(parts, list) or not parts:
        return ""
    texts: list[str] = []
    for p in parts:
        if not isinstance(p, dict):
            continue
        t = p.get("text")
        if isinstance(t, str) and t.strip():
            texts.append(t.strip())
    return "\n".join(texts).strip()


def _guess_image_mime_from_filename(filename: str) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "image/jpeg"
    if lower.endswith(".png"):
        return "image/png"
    # Default to PNG: safe for most image bytes we store.
    return "image/png"


async def _load_file_bytes_as_base64_and_mime(
    *,
    file_id: uuid.UUID,
    current_user: Any,
    session: Any,
    storage_service: StorageService,
    max_bytes: int = 12 * 1024 * 1024,
) -> tuple[str, str]:
    """Load a user file as base64 + mimeType for Gemini inlineData."""

    # Import lazily to avoid heavy deps at module import.
    from langflow.services.database.models.file.model import File as UserFile

    row = await session.get(UserFile, file_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"File not found: {file_id}")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You don't have access to this file")

    file_path = str(row.path or "")
    if "/" not in file_path:
        raise HTTPException(status_code=400, detail="Invalid file path")
    prefix, filename = file_path.split("/", 1)
    try:
        flow_id = str(uuid.UUID(prefix))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid file path") from exc
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid file path")

    try:
        file_stream = await storage_service.get_file(flow_id=flow_id, file_name=filename)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found") from None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error reading file: {exc}") from exc

    if isinstance(file_stream, bytes):
        data = bytes(file_stream)
    elif hasattr(file_stream, "__aiter__"):
        buf = bytearray()
        async for chunk in file_stream:
            buf.extend(chunk)
            if max_bytes and len(buf) > int(max_bytes):
                raise HTTPException(status_code=413, detail="图片过大，请更换更小的图片后再试。")
        data = bytes(buf)
    elif hasattr(file_stream, "read"):
        try:
            data = await file_stream.read()
        except TypeError:
            data = file_stream.read()
        if not isinstance(data, (bytes, bytearray)):
            raise HTTPException(status_code=500, detail="Invalid file stream read() result")
        data = bytes(data)
    else:
        raise HTTPException(status_code=500, detail="Unsupported file stream type")

    if not data:
        raise HTTPException(status_code=400, detail="图片为空，请重新上传后再试。")
    if max_bytes and len(data) > int(max_bytes):
        raise HTTPException(status_code=413, detail="图片过大，请更换更小的图片后再试。")

    return base64.b64encode(data).decode("ascii"), _guess_image_mime_from_filename(filename)


async def _gemini_generate_content(
    *,
    model: str,
    parts: list[dict[str, Any]],
    temperature: float = 0.2,
    max_output_tokens: int = 256,
    timeout_s: float = 60.0,
) -> str:
    api_key = _resolve_gemini_api_key()
    base_url = _resolve_gemini_base_url()
    url = f"{base_url}/models/{model}:generateContent"
    params = {"key": api_key}
    headers = {"Content-Type": "application/json"}
    body: dict[str, Any] = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": float(temperature), "maxOutputTokens": int(max_output_tokens)},
    }

    try:
        async with httpx.AsyncClient(timeout=float(timeout_s)) as client:
            resp = await client.post(url, headers=headers, params=params, json=body)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail=f"Gemini 请求失败: {exc}") from exc

    if resp.status_code != 200:
        body_txt = (resp.text or "").strip()
        raise HTTPException(
            status_code=HTTPStatus.BAD_GATEWAY,
            detail=f"Gemini 上游返回 HTTP {resp.status_code}" + (f": {body_txt[:500]}" if body_txt else ""),
        )

    try:
        payload = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail=f"Gemini 返回非 JSON: {resp.text[:500]}") from exc

    text = _extract_gemini_text(payload)
    return str(text or "").strip()


async def _poll_kling_task(
    *,
    task_id: str,
    timeout_s: float = 90.0,
) -> dict[str, Any]:
    """Poll Kling task status until it reaches a terminal state.

    Kling's "advanced-*" element APIs are async: create/delete return a task_id and the
    result (element_id, etc.) becomes available once the task succeeds.
    """

    deadline = _now() + timedelta(seconds=float(timeout_s))
    sleep_s = 1.2
    last_status = ""
    while _now() < deadline:
        data = await _kling_request(method="GET", path=f"/v1/general/advanced-custom-elements/{task_id}")
        if not isinstance(data, dict):
            raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail="Kling returned invalid task payload")

        status = str(data.get("task_status") or "").strip()
        last_status = status or last_status
        if status in ("succeed", "failed"):
            return data

        # Backoff with a cap; keep the UI snappy but avoid hammering upstream.
        await asyncio.sleep(min(max(sleep_s, 0.2), 5.0))
        sleep_s = min(sleep_s * 1.4, 5.0)

    raise HTTPException(
        status_code=HTTPStatus.GATEWAY_TIMEOUT,
        detail=f"主体创建超时，请稍后刷新重试（task_id={task_id}, last_status={last_status or 'unknown'}）",
    )


async def _poll_kling_multi_shot_task(
    *,
    task_id: str,
    timeout_s: float = 120.0,
) -> dict[str, Any]:
    """Poll Kling /v1/general/ai-multi-shot task until it reaches a terminal state."""

    deadline = _now() + timedelta(seconds=float(timeout_s))
    sleep_s = 1.2
    last_status = ""
    while _now() < deadline:
        data = await _kling_request(method="GET", path=f"/v1/general/ai-multi-shot/{task_id}")
        if not isinstance(data, dict):
            raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail="Kling returned invalid task payload")

        status = str(data.get("task_status") or "").strip()
        last_status = status or last_status
        if status in ("succeed", "failed"):
            return data

        await asyncio.sleep(min(max(sleep_s, 0.2), 5.0))
        sleep_s = min(sleep_s * 1.4, 5.0)

    raise HTTPException(
        status_code=HTTPStatus.GATEWAY_TIMEOUT,
        detail=f"智能补齐主体图超时，请稍后重试（task_id={task_id}, last_status={last_status or 'unknown'}）",
    )


def _extract_multi_shot_urls(task: dict[str, Any]) -> list[str]:
    task_result = task.get("task_result") if isinstance(task.get("task_result"), dict) else {}
    images = task_result.get("images") if isinstance(task_result.get("images"), list) else []

    out: list[tuple[int, str]] = []
    for item in images:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        try:
            idx = int(item.get("index") if item.get("index") is not None else 0)
        except Exception:
            idx = 0
        out.append((idx, url))
    out.sort(key=lambda x: x[0])
    return [u for _i, u in out]


def _guess_image_ext(*, url: str, content_type: str | None) -> str:
    ct = str(content_type or "").lower().split(";", 1)[0].strip()
    if ct in ("image/jpeg", "image/jpg"):
        return ".jpg"
    if ct == "image/png":
        return ".png"

    try:
        path = urlparse(url).path or ""
    except Exception:
        path = ""
    lower = path.lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return ".jpg"
    if lower.endswith(".png"):
        return ".png"
    return ".png"


async def _download_image_bytes(*, url: str) -> tuple[bytes, str]:
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(url)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail=f"下载生成图片失败：{exc}") from exc

    if resp.status_code < 200 or resp.status_code >= 300:
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail=f"下载生成图片失败：HTTP {resp.status_code}")

    data = bytes(resp.content or b"")
    if not data:
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail="下载生成图片失败：内容为空")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail="下载生成图片失败：图片过大")

    ext = _guess_image_ext(url=url, content_type=resp.headers.get("Content-Type"))
    return data, ext


async def _persist_user_image_file(
    *,
    session: Any,
    current_user: Any,
    storage_service: StorageService,
    data: bytes,
    ext: str,
) -> Any:
    """Save bytes to storage and insert a File row for the current user."""

    # Import lazily to avoid heavy deps at module import.
    from langflow.services.database.models.file.model import File as UserFile

    file_id = uuid.uuid4()
    root = f"kling_multi_shot_{file_id.hex}"
    safe_ext = ext if ext in (".png", ".jpg") else ".png"
    stored_file_name = f"{root}{safe_ext}"

    await storage_service.save_file(flow_id=str(current_user.id), file_name=stored_file_name, data=data)
    size = await storage_service.get_file_size(flow_id=str(current_user.id), file_name=stored_file_name)

    row = UserFile(
        id=file_id,
        user_id=current_user.id,
        name=root,
        path=f"{current_user.id}/{stored_file_name}",
        size=int(size or 0),
    )
    session.add(row)
    return row


class KlingElementCreateRequest(BaseModel):
    element_name: str = Field(..., max_length=20)
    element_description: str = Field(..., max_length=100)
    # v2 file IDs uploaded via /api/v2/files
    reference_type: str = Field("image_refer", description="image_refer|video_refer")
    frontal_file_id: uuid.UUID | None = None
    refer_file_ids: list[uuid.UUID] | None = None
    video_file_id: uuid.UUID | None = None
    tag_id: str = Field(..., description="tag id like o_101")
    element_voice_id: str | None = Field(None, description="voice id; only for video_refer")


class KlingElementRead(BaseModel):
    asset_id: uuid.UUID
    element_id: int
    element_name: str
    element_description: str
    tag_id: str
    reference_type: str = "image_refer"
    preview_file_id: uuid.UUID | None = None
    frontal_file_id: uuid.UUID | None = None
    refer_file_ids: list[uuid.UUID] = Field(default_factory=list)
    video_file_id: uuid.UUID | None = None
    element_voice_id: str | None = None
    created_at: datetime
    updated_at: datetime


class KlingPresetElementRead(BaseModel):
    element_id: int
    element_name: str
    element_description: str = ""
    reference_type: str = ""
    frontal_image: str = ""


class KlingElementDeleteRequest(BaseModel):
    asset_id: uuid.UUID


class KlingVideoTrimRequest(BaseModel):
    file_id: uuid.UUID
    start_s: float = Field(..., ge=0)
    end_s: float = Field(..., gt=0)


class KlingSmartFillRequest(BaseModel):
    """智能补齐主体图：只给一张正面图，生成 1-3 张其他角度参考图，并落盘到用户文件库。"""

    frontal_file_id: uuid.UUID
    # UI 用于“只补空位”：传需要补齐的张数（1-3）。
    need: int = Field(3, ge=1, le=3)
    timeout_s: float = Field(120.0, ge=5.0, le=600.0)


class KlingSmartFillResponse(BaseModel):
    task_id: str
    files: list[UploadFileResponse]


class KlingSmartDescribeRequest(BaseModel):
    file_ids: list[uuid.UUID] = Field(..., description="Images to analyze: frontal + refer images (1-4).")
    user_description: str | None = Field(None, max_length=200, description="Optional user draft to optimize.")
    timeout_s: float = Field(60.0, ge=5.0, le=180.0)


class KlingSmartDescribeResponse(BaseModel):
    description: str


router = APIRouter(prefix="/library/kling-elements", tags=["Kling Elements"])


def _asset_to_read(asset: UserAsset) -> KlingElementRead:
    data = asset.data if isinstance(asset.data, dict) else {}
    meta = data.get("kling") if isinstance(data.get("kling"), dict) else {}
    file_meta = data.get("files") if isinstance(data.get("files"), dict) else {}

    element_id = meta.get("element_id")
    reference_type = str(meta.get("reference_type") or file_meta.get("reference_type") or "image_refer")

    frontal_file_id = file_meta.get("frontal_file_id")
    video_file_id = file_meta.get("video_file_id")
    refer_file_ids = file_meta.get("refer_file_ids") if isinstance(file_meta.get("refer_file_ids"), list) else []
    element_voice_id = meta.get("element_voice_id")

    preview_file_id: uuid.UUID | None = None
    if reference_type == "video_refer" and video_file_id:
        preview_file_id = uuid.UUID(str(video_file_id))
    elif frontal_file_id:
        preview_file_id = uuid.UUID(str(frontal_file_id))

    return KlingElementRead(
        asset_id=asset.id,
        element_id=int(element_id),
        element_name=str(asset.name),
        element_description=str(meta.get("element_description") or ""),
        tag_id=str(meta.get("tag_id") or ""),
        reference_type=reference_type,
        preview_file_id=preview_file_id,
        frontal_file_id=uuid.UUID(str(frontal_file_id)) if frontal_file_id else None,
        refer_file_ids=[uuid.UUID(str(x)) for x in refer_file_ids],
        video_file_id=uuid.UUID(str(video_file_id)) if video_file_id else None,
        element_voice_id=str(element_voice_id) if element_voice_id is not None else None,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
    )


@router.get("/public-files/{file_id}", name="kling_public_file", status_code=HTTPStatus.OK)
async def public_file_download(
    *,
    file_id: uuid.UUID,
    expires: int,
    sig: str,
    session: DbSession,
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
    settings_service: Annotated[SettingsService, Depends(get_settings_service)],
):
    # Signed link so Kling can fetch user-uploaded video without our auth cookies/JWT.
    now = int(_now().timestamp())
    if int(expires) < now - 30:
        raise HTTPException(status_code=HTTPStatus.FORBIDDEN, detail="Link expired")

    msg = f"{file_id}.{int(expires)}"
    expected = _hmac_sig(_file_token_secret(settings_service), msg)
    if not hmac.compare_digest(str(sig or ""), expected):
        raise HTTPException(status_code=HTTPStatus.FORBIDDEN, detail="Invalid signature")

    # Import lazily to avoid heavy deps at module import.
    from langflow.services.database.models.file.model import File as UserFile

    row = await session.get(UserFile, file_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = str(row.path or "")
    if "/" not in file_path:
        raise HTTPException(status_code=400, detail="Invalid file path")
    prefix, filename = file_path.split("/", 1)
    try:
        flow_id = str(uuid.UUID(prefix))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid file path") from exc
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid file path")

    try:
        file_stream = await storage_service.get_file(flow_id=flow_id, file_name=filename)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found") from None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error downloading file: {exc}") from exc

    # StorageService may return bytes, an async iterator, or a file-like object.
    async def _iter_chunks():
        if isinstance(file_stream, bytes):
            yield file_stream
            return
        if hasattr(file_stream, "__aiter__"):
            async for chunk in file_stream:
                yield chunk
            return
        if hasattr(file_stream, "read"):
            try:
                while True:
                    chunk = await file_stream.read(1024 * 1024)
                    if not chunk:
                        break
                    yield chunk
            except TypeError:
                while True:
                    chunk = file_stream.read(1024 * 1024)
                    if not chunk:
                        break
                    yield chunk
            return
        raise HTTPException(status_code=500, detail="Unsupported file stream type")

    lower = filename.lower()
    media_type = "application/octet-stream"
    if lower.endswith(".mp4"):
        media_type = "video/mp4"
    elif lower.endswith(".mov"):
        media_type = "video/quicktime"

    return StreamingResponse(_iter_chunks(), media_type=media_type)


@router.post("/trim-video", response_model=UploadFileResponse, status_code=HTTPStatus.OK)
async def trim_video_for_kling(
    *,
    payload: KlingVideoTrimRequest,
    session: DbSession,
    current_user: CurrentActiveUser,
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
):
    """Trim a user video to 3-8s so it can be used for Kling video_refer subjects."""

    start_s = float(payload.start_s)
    end_s = float(payload.end_s)
    if end_s <= start_s:
        raise HTTPException(status_code=400, detail="end_s must be greater than start_s")

    dur = end_s - start_s
    if dur < 3.0 or dur > 8.0:
        raise HTTPException(status_code=400, detail="裁剪后时长必须在 3s ~ 8s 之间")

    row = await _load_user_file_for_owner(file_id=payload.file_id, current_user=current_user, session=session)
    file_path = str(getattr(row, "path", "") or "")
    lower = file_path.lower()
    if not (lower.endswith(".mp4") or lower.endswith(".mov")):
        raise HTTPException(status_code=400, detail="仅支持 MP4/MOV 视频裁剪")

    # Guardrail (matches upstream doc): max 200MB.
    max_bytes = 200 * 1024 * 1024
    src_bytes = await _load_user_file_bytes_by_path(
        file_path=file_path,
        storage_service=storage_service,
        max_bytes=max_bytes,
    )

    with tempfile.TemporaryDirectory(prefix="kling-trim-") as td:
        in_path = os.path.join(td, "input" + (".mov" if lower.endswith(".mov") else ".mp4"))
        out_path = os.path.join(td, "output.mp4")
        with open(in_path, "wb") as f:
            f.write(src_bytes)

        cmd = [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            str(start_s),
            "-to",
            str(end_s),
            "-i",
            in_path,
            # Re-encode so trimming is accurate and output is mp4 for upstream pull.
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            out_path,
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as exc:
            msg = (exc.stderr or exc.stdout or str(exc)).strip()
            raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail=f"视频裁剪失败：{msg}") from exc

        try:
            with open(out_path, "rb") as f:
                out_bytes = f.read()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to read trimmed output: {exc}") from exc

    # Persist as a new user file; return file_id to the UI.
    from langflow.services.database.models.file.model import File as UserFile

    new_id = uuid.uuid4()
    stored_file_name = f"trim_{new_id}.mp4"
    await storage_service.save_file(flow_id=str(current_user.id), file_name=stored_file_name, data=out_bytes)
    try:
        size = await storage_service.get_file_size(flow_id=str(current_user.id), file_name=stored_file_name)
    except Exception:
        size = len(out_bytes)

    new_file = UserFile(
        id=new_id,
        user_id=current_user.id,
        name=f"trim_{new_id}",
        path=f"{current_user.id}/{stored_file_name}",
        size=int(size or 0),
    )
    session.add(new_file)
    await session.commit()
    await session.refresh(new_file)

    return UploadFileResponse(id=new_file.id, name=str(new_file.name), path=str(new_file.path), size=int(new_file.size or 0))


@router.get("/custom", response_model=list[KlingElementRead], status_code=HTTPStatus.OK)
async def list_custom_elements(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    limit: int = 200,
    offset: int = 0,
):
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))
    stmt = (
        select(UserAsset)
        .where(UserAsset.user_id == current_user.id)
        .where(UserAsset.category == KLING_ELEMENTS_CATEGORY)
        .order_by(col(UserAsset.updated_at).desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.exec(stmt)).all()
    out: list[KlingElementRead] = []
    for a in rows:
        try:
            out.append(_asset_to_read(a))
        except Exception:
            # Skip corrupted rows; keep the panel usable.
            continue
    return out


@router.get("/presets", response_model=list[KlingPresetElementRead], status_code=HTTPStatus.OK)
async def list_preset_elements(
    *,
    _current_user: CurrentActiveUser,
    page_num: int = 1,
    page_size: int = 200,
):
    page_num = max(1, min(int(page_num), 1000))
    page_size = max(1, min(int(page_size), 500))

    data = await _kling_request(
        method="GET",
        path=f"/v1/general/advanced-presets-elements?pageNum={page_num}&pageSize={page_size}",
    )
    if not isinstance(data, list):
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail="Kling returned invalid presets payload")

    out: list[KlingPresetElementRead] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        # Only surface usable (finished) items.
        if str(item.get("task_status") or "") not in ("succeed", "", "Succeed"):
            continue

        task_result = item.get("task_result") if isinstance(item.get("task_result"), dict) else {}
        element_id = task_result.get("element_id")
        element_name = task_result.get("element_name")
        if element_id is None or not element_name:
            continue

        element_description = str(task_result.get("element_description") or "")
        reference_type = str(task_result.get("reference_type") or "")

        frontal_image = ""
        img_list = task_result.get("element_image_list") if isinstance(task_result.get("element_image_list"), dict) else {}
        if isinstance(img_list, dict):
            frontal_image = str(img_list.get("frontal_image") or "")

        out.append(
            KlingPresetElementRead(
                element_id=int(element_id),
                element_name=str(element_name),
                element_description=element_description,
                reference_type=reference_type,
                frontal_image=frontal_image,
            )
        )

    return out


@router.post("/custom", response_model=KlingElementRead, status_code=HTTPStatus.CREATED)
async def create_custom_element(
    *,
    request: Request,
    session: DbSession,
    current_user: CurrentActiveUser,
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
    settings_service: Annotated[SettingsService, Depends(get_settings_service)],
    payload: KlingElementCreateRequest,
):
    reference_type = str(payload.reference_type or "image_refer").strip()
    if reference_type not in ("image_refer", "video_refer"):
        raise HTTPException(status_code=400, detail="reference_type must be image_refer or video_refer")

    # New "advanced" API returns a task_id (async). We'll poll until it succeeds so the UI can
    # immediately use the created element_id.
    create_body: dict[str, Any] = {
        "element_name": payload.element_name,
        "element_description": payload.element_description,
        "reference_type": reference_type,
        "tag_list": [{"tag_id": payload.tag_id}],
    }

    if reference_type == "image_refer":
        if payload.frontal_file_id is None:
            raise HTTPException(status_code=400, detail="frontal_file_id is required for image_refer")
        refer_ids = payload.refer_file_ids or []
        if len(refer_ids) < 1 or len(refer_ids) > 3:
            raise HTTPException(status_code=400, detail="refer_file_ids must be 1-3 for image_refer")

        frontal_b64 = await _load_file_bytes_as_base64(
            file_id=payload.frontal_file_id,
            current_user=current_user,
            session=session,
            storage_service=storage_service,
        )
        refer_b64_list = [
            await _load_file_bytes_as_base64(
                file_id=fid,
                current_user=current_user,
                session=session,
                storage_service=storage_service,
            )
            for fid in refer_ids
        ]
        create_body["element_image_list"] = {
            "frontal_image": frontal_b64,
            "refer_images": [{"image_url": b64} for b64 in refer_b64_list],
        }
    else:
        if payload.video_file_id is None:
            raise HTTPException(status_code=400, detail="video_file_id is required for video_refer")

        # Ensure ownership before minting a public URL.
        video_row = await _load_user_file_for_owner(
            file_id=payload.video_file_id,
            current_user=current_user,
            session=session,
        )
        video_url = _build_public_file_url(
            request=request,
            file_id=payload.video_file_id,
            settings_service=settings_service,
            ttl_s=60 * 60,  # give Kling enough time to fetch video during async task processing
        )
        create_body["element_video_list"] = {"refer_videos": [{"video_url": video_url}]}
        if payload.element_voice_id:
            create_body["element_voice_id"] = str(payload.element_voice_id)

        # Keep a hint for debugging (do not store the signed URL).
        create_body["external_task_id"] = str(video_row.id)

    created_task = await _kling_request(
        method="POST",
        path="/v1/general/advanced-custom-elements",
        json=create_body,
    )
    if not isinstance(created_task, dict) or not created_task.get("task_id"):
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail="Kling returned invalid create task payload")

    task_id = str(created_task.get("task_id"))
    task = await _poll_kling_task(task_id=task_id)
    task_status = str(task.get("task_status") or "")
    if task_status == "failed":
        msg = str(task.get("task_status_msg") or "主体创建失败").strip()
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail=msg)

    task_result = task.get("task_result") if isinstance(task.get("task_result"), dict) else {}
    element_id_raw = task_result.get("element_id")
    if element_id_raw is None:
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail="Kling returned task without element_id")

    element_id = int(element_id_raw)

    asset = UserAsset(
        user_id=current_user.id,
        name=payload.element_name,
        category=KLING_ELEMENTS_CATEGORY,
        tags=[payload.tag_id],
        cover={
            "kind": "asset",
            # Use an image if present; otherwise just keep it blank and let the UI render a placeholder.
            "assetId": str(payload.frontal_file_id) if payload.frontal_file_id else "",
        },
        data={
            "kind": "kling_element",
            "kling": {
                "element_id": element_id,
                "task_id": task_id,
                "reference_type": reference_type,
                "tag_id": payload.tag_id,
                "element_description": payload.element_description,
                "element_voice_id": str(payload.element_voice_id) if payload.element_voice_id else None,
            },
            "files": {
                "reference_type": reference_type,
                "frontal_file_id": str(payload.frontal_file_id) if payload.frontal_file_id else None,
                "refer_file_ids": [str(x) for x in (payload.refer_file_ids or [])],
                "video_file_id": str(payload.video_file_id) if payload.video_file_id else None,
            },
        },
        resource_map={},
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(asset)
    await session.commit()
    await session.refresh(asset)
    return _asset_to_read(asset)


@router.post("/smart-fill", response_model=KlingSmartFillResponse, status_code=HTTPStatus.OK)
async def smart_fill_element_images(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
    payload: KlingSmartFillRequest,
):
    """智能补齐主体图（只补空位的张数由 need 控制）。"""

    frontal_b64 = await _load_file_bytes_as_base64(
        file_id=payload.frontal_file_id,
        current_user=current_user,
        session=session,
        storage_service=storage_service,
    )

    created_task = await _kling_request(
        method="POST",
        path="/v1/general/ai-multi-shot",
        json={
            "element_frontal_image": frontal_b64,
            # Keep a traceable id for debugging.
            "external_task_id": str(payload.frontal_file_id),
        },
    )
    if not isinstance(created_task, dict) or not created_task.get("task_id"):
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail="Kling returned invalid create task payload")

    task_id = str(created_task.get("task_id"))
    task = await _poll_kling_multi_shot_task(task_id=task_id, timeout_s=float(payload.timeout_s))
    task_status = str(task.get("task_status") or "")
    if task_status == "failed":
        msg = str(task.get("task_status_msg") or "智能补齐主体图失败").strip()
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail=msg)

    urls = _extract_multi_shot_urls(task)
    if not urls:
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail="Kling returned no image urls")

    need = max(1, min(int(payload.need), 3))
    selected = urls[:need]

    rows: list[Any] = []
    for u in selected:
        data, ext = await _download_image_bytes(url=u)
        rows.append(
            await _persist_user_image_file(
                session=session,
                current_user=current_user,
                storage_service=storage_service,
                data=data,
                ext=ext,
            )
        )

    await session.commit()

    files = [
        UploadFileResponse(
            id=r.id,
            name=str(r.name),
            path=str(r.path),
            size=int(getattr(r, "size", 0) or 0),
            provider=getattr(r, "provider", None),
        )
        for r in rows
    ]
    return KlingSmartFillResponse(task_id=task_id, files=files)


@router.post("/smart-describe", response_model=KlingSmartDescribeResponse, status_code=HTTPStatus.OK)
async def smart_describe_element(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
    payload: KlingSmartDescribeRequest,
):
    file_ids = [uuid.UUID(str(x)) for x in (payload.file_ids or [])]
    if not file_ids:
        raise HTTPException(status_code=400, detail="请先上传主体图片后再使用智能描述。")
    if len(file_ids) > 4:
        raise HTTPException(status_code=400, detail="最多支持 4 张图片（正面图 + 其他参考图）。")

    user_desc = str(payload.user_description or "").strip()
    prompt = (
        "你是角色/主体设定专家。请基于给定图片，为“主体库”生成一段中文主体描述，用于保持人物/主体外观一致。\n"
        "要求：\n"
        "- 只输出描述文本，不要输出任何前缀、标题、引号或换行。\n"
        "- 描述主体的核心特征（外貌/物种/材质/颜色/服饰/配饰/风格），并尽量补全细节。\n"
        "- 如果用户提供了描述，请在不改变主体核心特征的前提下进行优化、补充与纠错。\n"
        "- 最终文本不超过100字。\n"
    )
    if user_desc:
        prompt += f"\n用户描述（可优化）：{user_desc}"

    parts: list[dict[str, Any]] = [{"text": prompt}]
    for fid in file_ids:
        data_b64, mime = await _load_file_bytes_as_base64_and_mime(
            file_id=fid,
            current_user=current_user,
            session=session,
            storage_service=storage_service,
        )
        # Gemini inlineData expects base64 string.
        parts.append({"inlineData": {"mimeType": mime, "data": data_b64}})

    text = await _gemini_generate_content(
        model="gemini-3-flash-preview",
        parts=parts,
        temperature=0.2,
        max_output_tokens=256,
        timeout_s=float(payload.timeout_s),
    )
    # Normalize to a single line and enforce the 100-char constraint from element_description.
    out = " ".join(str(text or "").split()).strip()
    if not out:
        raise HTTPException(status_code=502, detail="Gemini 未返回可用的描述。")
    if len(out) > 100:
        out = out[:100]
    return KlingSmartDescribeResponse(description=out)


@router.post("/delete", status_code=HTTPStatus.OK)
async def delete_custom_element(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    payload: KlingElementDeleteRequest,
):
    asset = await session.get(UserAsset, payload.asset_id)
    if not asset or asset.user_id != current_user.id or asset.category != KLING_ELEMENTS_CATEGORY:
        raise HTTPException(status_code=404, detail="Element not found")

    data = asset.data if isinstance(asset.data, dict) else {}
    meta = data.get("kling") if isinstance(data.get("kling"), dict) else {}
    element_id = meta.get("element_id")
    if element_id is None:
        raise HTTPException(status_code=400, detail="Invalid element record: missing element_id")

    # Best-effort: delete upstream first, then remove DB record.
    await _kling_request(
        method="POST",
        path="/v1/general/delete-elements",
        json={"element_id": str(element_id)},
    )

    await session.delete(asset)
    await session.commit()
    return {"detail": "Deleted"}
