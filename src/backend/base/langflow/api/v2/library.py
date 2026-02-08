from __future__ import annotations

from datetime import datetime, timezone
from http import HTTPStatus
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func
from sqlmodel import col, select

from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.services.database.models.user_asset.model import (
    UserAsset,
    UserAssetCreate,
    UserAssetRead,
    UserAssetUpdate,
)
from langflow.services.database.models.user_workflow.model import (
    UserWorkflow,
    UserWorkflowCreate,
    UserWorkflowRead,
    UserWorkflowUpdate,
)

router = APIRouter(prefix="/library", tags=["Library"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/assets", response_model=list[UserAssetRead], status_code=HTTPStatus.OK)
async def list_assets(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    q: str | None = None,
    category: str | None = None,
    tags: Annotated[list[str] | None, Query()] = None,
    limit: int = 50,
    offset: int = 0,
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    stmt = select(UserAsset).where(UserAsset.user_id == current_user.id)
    if q:
        ql = q.strip().lower()
        if ql:
            stmt = stmt.where(func.lower(col(UserAsset.name)).contains(ql))
    if category:
        stmt = stmt.where(UserAsset.category == category)

    stmt = stmt.order_by(col(UserAsset.updated_at).desc()).limit(limit).offset(offset)
    rows = (await session.exec(stmt)).all()

    # Tag filtering (best-effort, cross-dialect).
    if tags:
        required = {t.strip() for t in tags if t and t.strip()}
        if required:
            rows = [r for r in rows if required.issubset(set(r.tags or []))]

    return [UserAssetRead.model_validate(r, from_attributes=True) for r in rows]


@router.post("/assets", response_model=UserAssetRead, status_code=HTTPStatus.CREATED)
async def create_asset(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    payload: UserAssetCreate,
):
    asset = UserAsset(
        user_id=current_user.id,
        name=payload.name,
        category=payload.category,
        tags=payload.tags,
        cover=payload.cover,
        data=payload.data,
        resource_map=payload.resource_map,
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(asset)
    await session.commit()
    await session.refresh(asset)
    return UserAssetRead.model_validate(asset, from_attributes=True)


@router.get("/assets/{asset_id}", response_model=UserAssetRead, status_code=HTTPStatus.OK)
async def get_asset(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    asset_id: UUID,
):
    asset = await session.get(UserAsset, asset_id)
    if not asset or asset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Asset not found")
    return UserAssetRead.model_validate(asset, from_attributes=True)


@router.put("/assets/{asset_id}", response_model=UserAssetRead, status_code=HTTPStatus.OK)
async def update_asset(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    asset_id: UUID,
    payload: UserAssetUpdate,
):
    asset = await session.get(UserAsset, asset_id)
    if not asset or asset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Asset not found")

    patch = payload.model_dump(exclude_unset=True)
    if patch:
        asset = asset.sqlmodel_update(patch)
        asset.updated_at = _now()
        session.add(asset)
        await session.commit()
        await session.refresh(asset)
    return UserAssetRead.model_validate(asset, from_attributes=True)


@router.delete("/assets/{asset_id}", status_code=HTTPStatus.OK)
async def delete_asset(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    asset_id: UUID,
):
    asset = await session.get(UserAsset, asset_id)
    if not asset or asset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Asset not found")
    await session.delete(asset)
    await session.commit()
    return {"detail": "Deleted"}


@router.post("/assets/{asset_id}/mark_used", response_model=UserAssetRead, status_code=HTTPStatus.OK)
async def mark_asset_used(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    asset_id: UUID,
):
    asset = await session.get(UserAsset, asset_id)
    if not asset or asset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.last_used_at = _now()
    asset.updated_at = _now()
    session.add(asset)
    await session.commit()
    await session.refresh(asset)
    return UserAssetRead.model_validate(asset, from_attributes=True)


@router.get("/workflows", response_model=list[UserWorkflowRead], status_code=HTTPStatus.OK)
async def list_workflows(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    q: str | None = None,
    tags: Annotated[list[str] | None, Query()] = None,
    limit: int = 50,
    offset: int = 0,
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    stmt = select(UserWorkflow).where(UserWorkflow.user_id == current_user.id)
    if q:
        ql = q.strip().lower()
        if ql:
            stmt = stmt.where(func.lower(col(UserWorkflow.name)).contains(ql))

    stmt = stmt.order_by(col(UserWorkflow.updated_at).desc()).limit(limit).offset(offset)
    rows = (await session.exec(stmt)).all()

    if tags:
        required = {t.strip() for t in tags if t and t.strip()}
        if required:
            rows = [r for r in rows if required.issubset(set(r.tags or []))]

    return [UserWorkflowRead.model_validate(r, from_attributes=True) for r in rows]


@router.post("/workflows", response_model=UserWorkflowRead, status_code=HTTPStatus.CREATED)
async def create_workflow(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    payload: UserWorkflowCreate,
):
    wf = UserWorkflow(
        user_id=current_user.id,
        name=payload.name,
        note=payload.note,
        tags=payload.tags,
        cover=payload.cover,
        selection=payload.selection,
        resource_map=payload.resource_map,
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(wf)
    await session.commit()
    await session.refresh(wf)
    return UserWorkflowRead.model_validate(wf, from_attributes=True)


@router.get("/workflows/{workflow_id}", response_model=UserWorkflowRead, status_code=HTTPStatus.OK)
async def get_workflow(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    workflow_id: UUID,
):
    wf = await session.get(UserWorkflow, workflow_id)
    if not wf or wf.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return UserWorkflowRead.model_validate(wf, from_attributes=True)


@router.put("/workflows/{workflow_id}", response_model=UserWorkflowRead, status_code=HTTPStatus.OK)
async def update_workflow(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    workflow_id: UUID,
    payload: UserWorkflowUpdate,
):
    wf = await session.get(UserWorkflow, workflow_id)
    if not wf or wf.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    patch = payload.model_dump(exclude_unset=True)
    if patch:
        wf = wf.sqlmodel_update(patch)
        wf.updated_at = _now()
        session.add(wf)
        await session.commit()
        await session.refresh(wf)
    return UserWorkflowRead.model_validate(wf, from_attributes=True)


@router.delete("/workflows/{workflow_id}", status_code=HTTPStatus.OK)
async def delete_workflow(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    workflow_id: UUID,
):
    wf = await session.get(UserWorkflow, workflow_id)
    if not wf or wf.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await session.delete(wf)
    await session.commit()
    return {"detail": "Deleted"}


@router.post("/workflows/{workflow_id}/mark_used", response_model=UserWorkflowRead, status_code=HTTPStatus.OK)
async def mark_workflow_used(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    workflow_id: UUID,
):
    wf = await session.get(UserWorkflow, workflow_id)
    if not wf or wf.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf.last_used_at = _now()
    wf.updated_at = _now()
    session.add(wf)
    await session.commit()
    await session.refresh(wf)
    return UserWorkflowRead.model_validate(wf, from_attributes=True)
