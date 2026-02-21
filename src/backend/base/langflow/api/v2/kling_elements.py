from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import os
import uuid
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from typing import Any, Annotated
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import col, select

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
        detail="未配置 KLING_API_KEY（或 provider credentials: kling）。请先配置后再创建/删除主体。",
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
