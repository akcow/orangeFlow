from __future__ import annotations

from datetime import datetime, timezone
from http import HTTPStatus
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, select

from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.services.database.models.community_item.model import (
    CommunityItem,
    CommunityItemLike,
    CommunityItemCreate,
    CommunityItemRead,
    CommunityItemReviewLog,
    CommunityItemStatusEnum,
    CommunityItemTypeEnum,
    CommunityItemUpdate,
    CommunityReviewActionEnum,
)
from langflow.services.database.models.flow.model import AccessTypeEnum, Flow
from langflow.services.database.models.user.model import User

router = APIRouter(prefix="/community", tags=["Community"])


class CommunityItemPublicRead(CommunityItemRead):
    user_name: str | None = None
    user_profile_image: str | None = None
    last_review_action: CommunityReviewActionEnum | None = None
    last_review_comment: str | None = None
    last_review_reviewer_name: str | None = None
    last_reviewed_at: datetime | None = None


class CommunityItemReviewList(SQLModel):
    total_count: int
    items: list[CommunityItemPublicRead]


class CommunityReviewDecisionPayload(SQLModel):
    comment: str | None = None


class CommunityReviewBatchPayload(SQLModel):
    item_ids: list[UUID]
    action: CommunityReviewActionEnum
    comment: str | None = None


class CommunityReviewBatchResult(SQLModel):
    total_requested: int
    processed_count: int
    missing_item_ids: list[UUID]


class CommunityItemMetricsRead(SQLModel):
    id: UUID
    view_count: int
    like_count: int
    liked: bool | None = None


class CommunityLikeStatusPayload(SQLModel):
    item_ids: list[UUID]


class CommunityLikeStatusRead(SQLModel):
    liked_item_ids: list[UUID]


class CommunityReviewLogRead(SQLModel):
    id: UUID
    action: CommunityReviewActionEnum
    from_status: CommunityItemStatusEnum
    to_status: CommunityItemStatusEnum
    comment: str | None = None
    reviewer_id: UUID
    reviewer_name: str | None = None
    created_at: datetime


class CommunityReviewFlowRead(SQLModel):
    id: UUID
    name: str
    description: str | None = None
    access_type: AccessTypeEnum
    updated_at: datetime | None = None
    data: dict | None = None


class CommunityItemReviewDetail(SQLModel):
    item: CommunityItemPublicRead
    flow: CommunityReviewFlowRead | None = None
    logs: list[CommunityReviewLogRead]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_storage_path(path: str | None) -> str | None:
    if path is None:
        return None
    normalized = str(path).strip().replace("\\", "/").lstrip("/")
    return normalized or None


def _normalize_comment(comment: str | None) -> str | None:
    if comment is None:
        return None
    normalized = str(comment).strip()
    if not normalized:
        return None
    return normalized[:500]


def _normalize_category(category: str | None) -> str | None:
    if category is None:
        return None
    normalized = str(category).strip()
    if not normalized:
        return None
    return normalized[:40]


def _can_review(current_user: User) -> bool:
    return bool(current_user.is_superuser or getattr(current_user, "is_reviewer", False))


def _ensure_can_review(current_user: User) -> None:
    if not _can_review(current_user):
        raise HTTPException(status_code=403, detail="Reviewer only")


def _fill_item_read(
    item: CommunityItem,
    *,
    username: str | None,
    profile_image: str | None,
    latest_log: tuple[CommunityItemReviewLog, str | None] | None = None,
) -> CommunityItemPublicRead:
    dto = CommunityItemPublicRead.model_validate(item, from_attributes=True)
    dto.cover_path = _normalize_storage_path(dto.cover_path)
    dto.media_path = _normalize_storage_path(dto.media_path)
    dto.user_name = username
    dto.user_profile_image = profile_image
    if latest_log:
        log, reviewer_name = latest_log
        dto.last_review_action = log.action
        dto.last_review_comment = log.comment
        dto.last_review_reviewer_name = reviewer_name
        dto.last_reviewed_at = log.created_at
    return dto


def _to_item_metrics(item: CommunityItem, *, liked: bool | None = None) -> CommunityItemMetricsRead:
    return CommunityItemMetricsRead(
        id=item.id,
        view_count=item.view_count or 0,
        like_count=item.like_count or 0,
        liked=liked,
    )


async def _get_latest_review_map(
    *,
    session: DbSession,
    item_ids: list[UUID],
) -> dict[UUID, tuple[CommunityItemReviewLog, str | None]]:
    if not item_ids:
        return {}
    stmt = (
        select(CommunityItemReviewLog, User.username)
        .join(User, CommunityItemReviewLog.reviewer_id == User.id)
        .where(CommunityItemReviewLog.item_id.in_(item_ids))
        .order_by(CommunityItemReviewLog.item_id.asc(), CommunityItemReviewLog.created_at.desc())
    )
    rows = (await session.exec(stmt)).all()
    latest: dict[UUID, tuple[CommunityItemReviewLog, str | None]] = {}
    for log, reviewer_name in rows:
        if log.item_id not in latest:
            latest[log.item_id] = (log, reviewer_name)
    return latest


async def _apply_review_action(
    *,
    session: DbSession,
    item: CommunityItem,
    current_user: User,
    action: CommunityReviewActionEnum,
    target_status: CommunityItemStatusEnum,
    comment: str | None,
) -> None:
    previous_status = item.status
    item.status = target_status
    item.cover_path = _normalize_storage_path(item.cover_path)
    item.media_path = _normalize_storage_path(item.media_path)
    item.updated_at = _now()
    session.add(item)

    review_log = CommunityItemReviewLog(
        item_id=item.id,
        reviewer_id=current_user.id,
        action=action,
        from_status=previous_status,
        to_status=target_status,
        comment=comment,
        created_at=_now(),
    )
    session.add(review_log)

    # Make underlying flow public if needed for clone/view.
    if target_status == CommunityItemStatusEnum.PUBLIC and (
        item.type == CommunityItemTypeEnum.WORKFLOW or item.public_canvas
    ):
        flow = await session.get(Flow, item.flow_id)
        if flow and flow.access_type != AccessTypeEnum.PUBLIC:
            flow.access_type = AccessTypeEnum.PUBLIC
            flow.updated_at = _now()
            session.add(flow)


@router.get("/items/public", response_model=list[CommunityItemPublicRead], status_code=HTTPStatus.OK)
async def list_public_items(
    *,
    session: DbSession,
    type: CommunityItemTypeEnum | None = None,  # noqa: A002
    category: str | None = None,
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
    normalized_category = _normalize_category(category)
    if normalized_category:
        stmt = stmt.where(CommunityItem.category == normalized_category)

    rows = (await session.exec(stmt)).all()
    item_ids = [item.id for item, _, _ in rows]
    latest_review_map = await _get_latest_review_map(session=session, item_ids=item_ids)
    out: list[CommunityItemPublicRead] = []
    for item, username, profile_image in rows:
        out.append(
            _fill_item_read(
                item,
                username=username,
                profile_image=profile_image,
                latest_log=latest_review_map.get(item.id),
            )
        )
    return out


@router.get("/items/mine", response_model=list[CommunityItemPublicRead], status_code=HTTPStatus.OK)
async def list_my_items(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    type: CommunityItemTypeEnum | None = None,  # noqa: A002
    category: str | None = None,
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
    normalized_category = _normalize_category(category)
    if normalized_category:
        stmt = stmt.where(CommunityItem.category == normalized_category)

    rows = (await session.exec(stmt)).all()
    item_ids = [item.id for item, _, _ in rows]
    latest_review_map = await _get_latest_review_map(session=session, item_ids=item_ids)
    out: list[CommunityItemPublicRead] = []
    for item, username, profile_image in rows:
        out.append(
            _fill_item_read(
                item,
                username=username,
                profile_image=profile_image,
                latest_log=latest_review_map.get(item.id),
            )
        )
    return out


@router.get("/items/review", response_model=CommunityItemReviewList, status_code=HTTPStatus.OK)
async def list_review_items(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    status: CommunityItemStatusEnum | None = CommunityItemStatusEnum.UNREVIEWED,
    type: CommunityItemTypeEnum | None = None,  # noqa: A002
    q: str | None = None,
    submitter: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """Reviewer-only queue for community items."""
    _ensure_can_review(current_user)

    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    if created_from and created_to and created_from > created_to:
        raise HTTPException(status_code=422, detail="created_from must be earlier than created_to")

    filters = []
    if status:
        filters.append(CommunityItem.status == status)
    if type:
        filters.append(CommunityItem.type == type)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        # COALESCE is important for nullable description.
        filters.append(
            func.lower(CommunityItem.title).like(like)
            | func.lower(func.coalesce(CommunityItem.description, "")).like(like)
        )
    if submitter and submitter.strip():
        submitter_like = f"%{submitter.strip().lower()}%"
        filters.append(func.lower(User.username).like(submitter_like))
    if created_from:
        filters.append(CommunityItem.created_at >= created_from)
    if created_to:
        filters.append(CommunityItem.created_at <= created_to)

    count_stmt = (
        select(func.count())
        .select_from(CommunityItem)
        .join(User, CommunityItem.user_id == User.id)
        .where(*filters)
    )
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
    item_ids = [item.id for item, _, _ in rows]
    latest_review_map = await _get_latest_review_map(session=session, item_ids=item_ids)
    items: list[CommunityItemPublicRead] = []
    for item, username, profile_image in rows:
        items.append(
            _fill_item_read(
                item,
                username=username,
                profile_image=profile_image,
                latest_log=latest_review_map.get(item.id),
            )
        )
    return CommunityItemReviewList(total_count=total_count, items=items)


@router.get(
    "/items/{item_id}/review-detail",
    response_model=CommunityItemReviewDetail,
    status_code=HTTPStatus.OK,
)
async def review_item_detail(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    item_id: UUID,
):
    _ensure_can_review(current_user)

    row = (
        await session.exec(
            select(CommunityItem, User.username, User.profile_image)
            .join(User, CommunityItem.user_id == User.id)
            .where(CommunityItem.id == item_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    item, username, profile_image = row

    latest_review_map = await _get_latest_review_map(session=session, item_ids=[item.id])
    dto = _fill_item_read(
        item,
        username=username,
        profile_image=profile_image,
        latest_log=latest_review_map.get(item.id),
    )

    flow = await session.get(Flow, item.flow_id)
    flow_dto = (
        CommunityReviewFlowRead(
            id=flow.id,
            name=flow.name,
            description=flow.description,
            access_type=flow.access_type,
            updated_at=flow.updated_at,
            data=flow.data or item.flow_snapshot,
        )
        if flow
        else (
            CommunityReviewFlowRead(
                id=item.flow_id,
                name="(原流程已不存在)",
                description=None,
                access_type=AccessTypeEnum.PRIVATE,
                updated_at=item.updated_at,
                data=item.flow_snapshot,
            )
            if item.flow_snapshot
            else None
        )
    )

    logs_stmt = (
        select(CommunityItemReviewLog, User.username)
        .join(User, CommunityItemReviewLog.reviewer_id == User.id)
        .where(CommunityItemReviewLog.item_id == item.id)
        .order_by(CommunityItemReviewLog.created_at.desc())
    )
    logs_rows = (await session.exec(logs_stmt)).all()
    logs = [
        CommunityReviewLogRead(
            id=log.id,
            action=log.action,
            from_status=log.from_status,
            to_status=log.to_status,
            comment=log.comment,
            reviewer_id=log.reviewer_id,
            reviewer_name=reviewer_name,
            created_at=log.created_at,
        )
        for log, reviewer_name in logs_rows
    ]

    return CommunityItemReviewDetail(item=dto, flow=flow_dto, logs=logs)


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
    normalized_cover_path = _normalize_storage_path(payload.cover_path)
    normalized_media_path = _normalize_storage_path(payload.media_path)

    if payload.type == CommunityItemTypeEnum.TV and (not normalized_media_path or not normalized_cover_path):
        raise HTTPException(status_code=422, detail="TV items require media_path and cover_path")

    status = payload.status or CommunityItemStatusEnum.UNREVIEWED
    if status == CommunityItemStatusEnum.PUBLIC and not _can_review(current_user):
        # Regular users must go through review before being public.
        status = CommunityItemStatusEnum.UNREVIEWED

    item = CommunityItem(
        type=payload.type,
        status=status,
        title=payload.title,
        description=payload.description,
        category=_normalize_category(payload.category),
        flow_id=payload.flow_id,
        user_id=current_user.id,
        cover_path=normalized_cover_path,
        media_path=normalized_media_path,
        public_canvas=payload.public_canvas,
        created_at=_now(),
        updated_at=_now(),
        flow_snapshot=flow.data,
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
    if item.user_id != current_user.id and not _can_review(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")

    update_data = patch.model_dump(exclude_unset=True)
    if (
        "status" in update_data
        and update_data["status"] == CommunityItemStatusEnum.PUBLIC
        and not _can_review(current_user)
    ):
        raise HTTPException(status_code=403, detail="Only reviewers can set status=PUBLIC")
    if "cover_path" in update_data:
        update_data["cover_path"] = _normalize_storage_path(update_data["cover_path"])
    if "media_path" in update_data:
        update_data["media_path"] = _normalize_storage_path(update_data["media_path"])
    if "category" in update_data:
        update_data["category"] = _normalize_category(update_data["category"])

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
    payload: CommunityReviewDecisionPayload | None = None,
):
    _ensure_can_review(current_user)
    item = await session.get(CommunityItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    await _apply_review_action(
        session=session,
        item=item,
        current_user=current_user,
        action=CommunityReviewActionEnum.APPROVE,
        target_status=CommunityItemStatusEnum.PUBLIC,
        comment=_normalize_comment(payload.comment if payload else None),
    )

    await session.commit()
    await session.refresh(item)
    return item


@router.post("/items/{item_id}/reject", response_model=CommunityItemRead, status_code=HTTPStatus.OK)
async def reject_item(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    item_id: UUID,
    payload: CommunityReviewDecisionPayload,
):
    _ensure_can_review(current_user)
    item = await session.get(CommunityItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    comment = _normalize_comment(payload.comment)
    if not comment:
        raise HTTPException(status_code=422, detail="Rejection reason is required")

    await _apply_review_action(
        session=session,
        item=item,
        current_user=current_user,
        action=CommunityReviewActionEnum.REJECT,
        target_status=CommunityItemStatusEnum.PRIVATE,
        comment=comment,
    )

    await session.commit()
    await session.refresh(item)
    return item


@router.post("/items/{item_id}/hide", response_model=CommunityItemRead, status_code=HTTPStatus.OK)
async def hide_item(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    item_id: UUID,
    payload: CommunityReviewDecisionPayload | None = None,
):
    item = await session.get(CommunityItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    is_reviewer = _can_review(current_user)
    if item.user_id != current_user.id and not is_reviewer:
        raise HTTPException(status_code=403, detail="Forbidden")

    comment = _normalize_comment(payload.comment if payload else None)
    if is_reviewer:
        await _apply_review_action(
            session=session,
            item=item,
            current_user=current_user,
            action=CommunityReviewActionEnum.HIDE,
            target_status=CommunityItemStatusEnum.PRIVATE,
            comment=comment,
        )
    else:
        item.status = CommunityItemStatusEnum.PRIVATE
        item.updated_at = _now()
        session.add(item)

    await session.commit()
    await session.refresh(item)
    return item


@router.post("/items/{item_id}/view", response_model=CommunityItemMetricsRead, status_code=HTTPStatus.OK)
async def record_item_view(
    *,
    session: DbSession,
    item_id: UUID,
):
    item = await session.get(CommunityItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.status != CommunityItemStatusEnum.PUBLIC:
        raise HTTPException(status_code=403, detail="Only public items can be viewed")

    item.view_count = (item.view_count or 0) + 1
    item.updated_at = _now()
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _to_item_metrics(item)


@router.post("/items/{item_id}/like", response_model=CommunityItemMetricsRead, status_code=HTTPStatus.OK)
async def like_item(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    item_id: UUID,
):
    item = await session.get(CommunityItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.status != CommunityItemStatusEnum.PUBLIC:
        raise HTTPException(status_code=403, detail="Only public items can be liked")

    existing_like = (
        await session.exec(
            select(CommunityItemLike)
            .where(CommunityItemLike.item_id == item_id)
            .where(CommunityItemLike.user_id == current_user.id)
        )
    ).first()
    if existing_like:
        await session.delete(existing_like)
        item.like_count = max(0, (item.like_count or 0) - 1)
        item.updated_at = _now()
        session.add(item)
        await session.commit()
        await session.refresh(item)
        return _to_item_metrics(item, liked=False)

    like = CommunityItemLike(item_id=item_id, user_id=current_user.id, created_at=_now())
    item.like_count = (item.like_count or 0) + 1
    item.updated_at = _now()
    session.add(like)
    session.add(item)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
    item = await session.get(CommunityItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _to_item_metrics(item, liked=True)


@router.post("/items/likes/status", response_model=CommunityLikeStatusRead, status_code=HTTPStatus.OK)
async def get_like_status(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    payload: CommunityLikeStatusPayload,
):
    item_ids = list(dict.fromkeys(payload.item_ids))
    if not item_ids:
        return CommunityLikeStatusRead(liked_item_ids=[])

    rows = (
        await session.exec(
            select(CommunityItemLike.item_id)
            .where(CommunityItemLike.user_id == current_user.id)
            .where(CommunityItemLike.item_id.in_(item_ids))
        )
    ).all()

    liked_item_ids = [item_id for item_id in rows if item_id is not None]
    return CommunityLikeStatusRead(liked_item_ids=liked_item_ids)


@router.post(
    "/items/review/batch",
    response_model=CommunityReviewBatchResult,
    status_code=HTTPStatus.OK,
)
async def batch_review_items(
    *,
    session: DbSession,
    current_user: CurrentActiveUser,
    payload: CommunityReviewBatchPayload,
):
    _ensure_can_review(current_user)

    item_ids: list[UUID] = []
    seen: set[UUID] = set()
    for item_id in payload.item_ids:
        if item_id in seen:
            continue
        seen.add(item_id)
        item_ids.append(item_id)
    if not item_ids:
        raise HTTPException(status_code=422, detail="item_ids is required")

    comment = _normalize_comment(payload.comment)
    if payload.action == CommunityReviewActionEnum.REJECT and not comment:
        raise HTTPException(status_code=422, detail="Rejection reason is required")

    items_stmt = select(CommunityItem).where(CommunityItem.id.in_(item_ids))
    rows = (await session.exec(items_stmt)).all()
    item_map = {item.id: item for item in rows}

    if payload.action == CommunityReviewActionEnum.APPROVE:
        target_status = CommunityItemStatusEnum.PUBLIC
    else:
        target_status = CommunityItemStatusEnum.PRIVATE

    processed_count = 0
    missing_item_ids: list[UUID] = []
    for item_id in item_ids:
        item = item_map.get(item_id)
        if not item:
            missing_item_ids.append(item_id)
            continue
        await _apply_review_action(
            session=session,
            item=item,
            current_user=current_user,
            action=payload.action,
            target_status=target_status,
            comment=comment,
        )
        processed_count += 1

    await session.commit()
    return CommunityReviewBatchResult(
        total_requested=len(item_ids),
        processed_count=processed_count,
        missing_item_ids=missing_item_ids,
    )
