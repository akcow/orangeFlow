from __future__ import annotations

import base64
import os
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from typing import Any, Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import col, select

from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.services.database.models.user_asset.model import UserAsset
from langflow.services.deps import get_storage_service
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


class KlingElementCreateRequest(BaseModel):
    element_name: str = Field(..., max_length=20)
    element_description: str = Field(..., max_length=100)
    # v2 file IDs uploaded via /api/v2/files
    frontal_file_id: uuid.UUID
    refer_file_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=3)
    tag_id: str = Field(..., description="tag id like o_101")


class KlingElementRead(BaseModel):
    asset_id: uuid.UUID
    element_id: int
    element_name: str
    element_description: str
    tag_id: str
    frontal_file_id: uuid.UUID
    refer_file_ids: list[uuid.UUID]
    created_at: datetime
    updated_at: datetime


class KlingElementDeleteRequest(BaseModel):
    asset_id: uuid.UUID


router = APIRouter(prefix="/library/kling-elements", tags=["Kling Elements"])


def _asset_to_read(asset: UserAsset) -> KlingElementRead:
    data = asset.data if isinstance(asset.data, dict) else {}
    meta = data.get("kling") if isinstance(data.get("kling"), dict) else {}
    file_meta = data.get("files") if isinstance(data.get("files"), dict) else {}

    element_id = meta.get("element_id")
    frontal_file_id = file_meta.get("frontal_file_id")
    refer_file_ids = file_meta.get("refer_file_ids") if isinstance(file_meta.get("refer_file_ids"), list) else []

    return KlingElementRead(
        asset_id=asset.id,
        element_id=int(element_id),
        element_name=str(asset.name),
        element_description=str(meta.get("element_description") or ""),
        tag_id=str(meta.get("tag_id") or ""),
        frontal_file_id=uuid.UUID(str(frontal_file_id)),
        refer_file_ids=[uuid.UUID(str(x)) for x in refer_file_ids],
        created_at=asset.created_at,
        updated_at=asset.updated_at,
    )


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


@router.post("/custom", response_model=KlingElementRead, status_code=HTTPStatus.CREATED)
async def create_custom_element(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
    payload: KlingElementCreateRequest,
):
    # Convert stored user files to base64 and call Kling upstream.
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
        for fid in payload.refer_file_ids
    ]

    upstream = await _kling_request(
        method="POST",
        path="/v1/general/custom-elements",
        json={
            "element_name": payload.element_name,
            "element_description": payload.element_description,
            "element_frontal_image": frontal_b64,
            "element_refer_list": [{"image_url": b64} for b64 in refer_b64_list],
            "tag_list": [{"tag_id": payload.tag_id}],
        },
    )
    if not isinstance(upstream, dict) or upstream.get("element_id") is None:
        raise HTTPException(status_code=HTTPStatus.BAD_GATEWAY, detail="Kling returned invalid element payload")

    element_id = int(upstream.get("element_id"))

    asset = UserAsset(
        user_id=current_user.id,
        name=payload.element_name,
        category=KLING_ELEMENTS_CATEGORY,
        tags=[payload.tag_id],
        cover={"kind": "asset", "assetId": str(payload.frontal_file_id)},
        data={
            "kind": "kling_element",
            "kling": {
                "element_id": element_id,
                "tag_id": payload.tag_id,
                "element_description": payload.element_description,
            },
            "files": {
                "frontal_file_id": str(payload.frontal_file_id),
                "refer_file_ids": [str(x) for x in payload.refer_file_ids],
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
