from __future__ import annotations

from datetime import datetime, timezone
from http import HTTPStatus
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import SQLModel, select

from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.services.database.models.community_item.model import (
    CommunityItem,
    CommunityItemCreate,
    CommunityItemRead,
    CommunityItemStatusEnum,
    CommunityItemTypeEnum,
    CommunityItemUpdate,
)
from langflow.services.database.models.flow.model import AccessTypeEnum, Flow
from langflow.services.database.models.user.model import User

router = APIRouter(prefix="/community", tags=["Community"])


class CommunityItemPublicRead(CommunityItemRead):
    user_name: str | None = None
    user_profile_image: str | None = None


class CommunityItemReviewList(SQLModel):
    total_count: int
    items: list[CommunityItemPublicRead]


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/items/public", response_model=list[CommunityItemPublicRead], status_code=HTTPStatus.OK)
async def list_public_items(
    *,
    session: DbSession,
    type: CommunityItemTypeEnum | None = None,  # noqa: A002
    limit: int = 50,
    offset: int = 0,
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    stmt = (
        select(CommunityItem, User.username, User.profile_image)
        .join(User, CommunityItem.user_id == User.id)
        .where(CommunityItem.status == CommunityItemStatusEnum.PUBLIC)
        .order_by(CommunityItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if type:
        stmt = stmt.where(CommunityItem.type == type)

    rows = (await session.exec(stmt)).all()
    out: list[CommunityItemPublicRead] = []
    for item, username, profile_image in rows:
        dto = CommunityItemPublicRead.model_validate(item, from_attributes=True)
        dto.user_name = username
        dto.user_profile_image = profile_image
        out.append(dto)
    return out


@router.get("/items/mine", response_model=list[CommunityItemPublicRead], status_code=HTTPStatus.OK)
async def list_my_items(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    type: CommunityItemTypeEnum | None = None,  # noqa: A002
    limit: int = 50,
    offset: int = 0,
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    stmt = (
        select(CommunityItem, User.username, User.profile_image)
        .join(User, CommunityItem.user_id == User.id)
        .where(CommunityItem.user_id == current_user.id)
        .order_by(CommunityItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if type:
        stmt = stmt.where(CommunityItem.type == type)

    rows = (await session.exec(stmt)).all()
    out: list[CommunityItemPublicRead] = []
    for item, username, profile_image in rows:
        dto = CommunityItemPublicRead.model_validate(item, from_attributes=True)
        dto.user_name = username
        dto.user_profile_image = profile_image
        out.append(dto)
    return out


@router.get("/items/review", response_model=CommunityItemReviewList, status_code=HTTPStatus.OK)
async def list_review_items(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    status: CommunityItemStatusEnum = CommunityItemStatusEnum.UNREVIEWED,
    type: CommunityItemTypeEnum | None = None,  # noqa: A002
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """Admin-only review queue for community items."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")

    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    filters = [CommunityItem.status == status]
    if type:
        filters.append(CommunityItem.type == type)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        # COALESCE is important for nullable description.
        filters.append(
            func.lower(CommunityItem.title).like(like)
            | func.lower(func.coalesce(CommunityItem.description, "")).like(like)
        )

    count_stmt = select(func.count()).select_from(CommunityItem).where(*filters)
    total_count = (await session.exec(count_stmt)).first() or 0

    stmt = (
        select(CommunityItem, User.username, User.profile_image)
        .join(User, CommunityItem.user_id == User.id)
        .where(*filters)
        .order_by(CommunityItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    rows = (await session.exec(stmt)).all()
    items: list[CommunityItemPublicRead] = []
    for item, username, profile_image in rows:
        dto = CommunityItemPublicRead.model_validate(item, from_attributes=True)
        dto.user_name = username
        dto.user_profile_image = profile_image
        items.append(dto)

    return CommunityItemReviewList(total_count=total_count, items=items)


@router.post("/items", response_model=CommunityItemRead, status_code=HTTPStatus.CREATED)
async def create_item(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    payload: CommunityItemCreate,
):
    flow = await session.get(Flow, payload.flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    if flow.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You don't have access to this flow")

    # Validate media requirements
    if payload.type == CommunityItemTypeEnum.TV:
        if not payload.media_path or not payload.cover_path:
            raise HTTPException(status_code=422, detail="TV items require media_path and cover_path")
    if payload.type == CommunityItemTypeEnum.WORKFLOW:
        # Workflows typically don't have a final media artifact.
        pass

    status = payload.status or CommunityItemStatusEnum.UNREVIEWED
    if status == CommunityItemStatusEnum.PUBLIC and not current_user.is_superuser:
        # Regular users must go through review before being public.
        status = CommunityItemStatusEnum.UNREVIEWED

    item = CommunityItem(
        type=payload.type,
        status=status,
        title=payload.title,
        description=payload.description,
        flow_id=payload.flow_id,
        user_id=current_user.id,
        cover_path=payload.cover_path,
        media_path=payload.media_path,
        public_canvas=payload.public_canvas,
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=CommunityItemRead, status_code=HTTPStatus.OK)
async def update_item(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    item_id: UUID,
    patch: CommunityItemUpdate,
):
    item = await session.get(CommunityItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Forbidden")

    update_data = patch.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] == CommunityItemStatusEnum.PUBLIC and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only superusers can set status=PUBLIC")

    for k, v in update_data.items():
        setattr(item, k, v)
    item.updated_at = _now()
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


@router.post("/items/{item_id}/approve", response_model=CommunityItemRead, status_code=HTTPStatus.OK)
async def approve_item(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    item_id: UUID,
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")

    item = await session.get(CommunityItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.status = CommunityItemStatusEnum.PUBLIC
    item.updated_at = _now()
    session.add(item)

    # Make underlying flow public if needed for clone/view.
    if item.type == CommunityItemTypeEnum.WORKFLOW or item.public_canvas:
        flow = await session.get(Flow, item.flow_id)
        if flow and flow.access_type != AccessTypeEnum.PUBLIC:
            flow.access_type = AccessTypeEnum.PUBLIC
            flow.updated_at = _now()
            session.add(flow)

    await session.commit()
    await session.refresh(item)
    return item


@router.post("/items/{item_id}/hide", response_model=CommunityItemRead, status_code=HTTPStatus.OK)
async def hide_item(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    item_id: UUID,
):
    item = await session.get(CommunityItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Forbidden")

    item.status = CommunityItemStatusEnum.PRIVATE
    item.updated_at = _now()
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item
