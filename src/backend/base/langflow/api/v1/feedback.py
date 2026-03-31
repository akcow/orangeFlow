from __future__ import annotations

import mimetypes
import re
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from pathlib import Path
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import select

from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.services.database.models.admin_notification.model import (
    AdminNotification,
    AdminNotificationRecipient,
    AdminNotificationTargetType,
)
from langflow.services.database.models.issue_feedback.model import (
    IssueFeedback,
    IssueFeedbackAttachment,
    IssueFeedbackAttachmentRead,
    IssueFeedbackRead,
    IssueFeedbackStatusEnum,
    IssueFeedbackUpdate,
)
from langflow.services.database.models.user.model import User
from langflow.services.deps import get_storage_service
from langflow.services.storage.service import StorageService

router = APIRouter(prefix="/feedback", tags=["Feedback"])

MAX_ATTACHMENTS = 10
MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024
MAX_DESCRIPTION_LENGTH = 8000
MAX_ADMIN_REPLY_LENGTH = 4000
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _sanitize_filename(filename: str) -> str:
    base_name = Path(filename or "attachment").name
    cleaned = SAFE_FILENAME_RE.sub("_", base_name).strip("._")
    return cleaned or "attachment"


def _infer_media_type(upload: UploadFile, fallback_name: str) -> str:
    media_type = (upload.content_type or "").strip().lower()
    if media_type.startswith(("image/", "video/")):
        return media_type
    guessed, _ = mimetypes.guess_type(fallback_name)
    return (guessed or "application/octet-stream").lower()


def _validate_media_type(media_type: str) -> None:
    if not media_type.startswith(("image/", "video/")):
        raise HTTPException(status_code=400, detail="只支持图片和视频附件")


def _attachment_preview_url(feedback_id: UUID, attachment_id: UUID) -> str:
    return f"/api/v1/feedback/{feedback_id}/attachments/{attachment_id}/content"


def _format_status_label(status: IssueFeedbackStatusEnum) -> str:
    labels = {
        IssueFeedbackStatusEnum.PENDING: "待处理",
        IssueFeedbackStatusEnum.IN_PROGRESS: "处理中",
        IssueFeedbackStatusEnum.RESOLVED: "已解决",
        IssueFeedbackStatusEnum.CLOSED: "已关闭",
    }
    return labels[status]


def _feedback_summary(description: str, *, limit: int = 240) -> str:
    normalized = " ".join(description.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 3] + "..."


def _iter_bytes(content: bytes) -> Iterable[bytes]:
    yield content


async def _create_notification(
    *,
    session: DbSession,
    created_by_id: UUID,
    recipient_user_ids: set[UUID],
    title: str,
    content: str,
    link: str | None = None,
) -> None:
    if not recipient_user_ids:
        return

    notification = AdminNotification(
        title=title[:120],
        content=content.strip(),
        link=link,
        created_by_id=created_by_id,
        target_type=AdminNotificationTargetType.USERS,
        expires_at=utc_now() + timedelta(days=30),
    )
    session.add(notification)
    await session.flush()

    for user_id in recipient_user_ids:
        session.add(AdminNotificationRecipient(notification_id=notification.id, user_id=user_id))


async def _build_feedback_reads(
    rows: list[tuple[IssueFeedback, str | None, str]],
    session: DbSession,
) -> list[IssueFeedbackRead]:
    feedback_ids = [feedback.id for feedback, _, _ in rows]
    reply_user_ids = [
        feedback.last_replied_by_id
        for feedback, _, _ in rows
        if feedback.last_replied_by_id is not None
    ]

    attachments = []
    if feedback_ids:
        attachments = (
            await session.exec(
                select(IssueFeedbackAttachment)
                .where(IssueFeedbackAttachment.feedback_id.in_(feedback_ids))  # type: ignore[attr-defined]
                .order_by(IssueFeedbackAttachment.created_at.asc())
            )
        ).all()

    attachment_map: dict[UUID, list[IssueFeedbackAttachmentRead]] = {}
    for attachment in attachments:
        attachment_map.setdefault(attachment.feedback_id, []).append(
            IssueFeedbackAttachmentRead(
                id=attachment.id,
                original_name=attachment.original_name,
                content_type=attachment.content_type,
                file_size=attachment.file_size,
                created_at=attachment.created_at,
                preview_url=_attachment_preview_url(attachment.feedback_id, attachment.id),
            )
        )

    reply_name_map: dict[UUID, str] = {}
    if reply_user_ids:
        reply_users = (
            await session.exec(select(User).where(User.id.in_(reply_user_ids)))  # type: ignore[attr-defined]
        ).all()
        reply_name_map = {
            reply_user.id: reply_user.nickname or reply_user.username
            for reply_user in reply_users
        }

    return [
        IssueFeedbackRead(
            id=feedback.id,
            user_id=feedback.user_id,
            reporter_name=reporter_name or reporter_username,
            reporter_username=reporter_username,
            description=feedback.description,
            status=feedback.status,
            latest_admin_reply=feedback.latest_admin_reply,
            last_replied_by_name=reply_name_map.get(feedback.last_replied_by_id)
            if feedback.last_replied_by_id
            else None,
            last_replied_at=feedback.last_replied_at,
            created_at=feedback.created_at,
            updated_at=feedback.updated_at,
            attachments=attachment_map.get(feedback.id, []),
        )
        for feedback, reporter_name, reporter_username in rows
    ]


async def _fetch_feedback_read(
    feedback_id: UUID,
    session: DbSession,
) -> IssueFeedbackRead:
    rows = (
        await session.exec(
            select(IssueFeedback, User.nickname, User.username)
            .join(User, User.id == IssueFeedback.user_id)
            .where(IssueFeedback.id == feedback_id)
        )
    ).all()
    feedback_reads = await _build_feedback_reads(rows, session)
    if not feedback_reads:
        raise HTTPException(status_code=404, detail="反馈记录不存在")
    return feedback_reads[0]


@router.post("/", response_model=IssueFeedbackRead, status_code=HTTPStatus.CREATED)
async def create_issue_feedback(
    session: DbSession,
    current_user: CurrentActiveUser,
    storage_service: StorageService = Depends(get_storage_service),
    description: str = Form(...),
    files: list[UploadFile] | None = File(default=None),
):
    normalized_description = description.strip()
    if not normalized_description:
        raise HTTPException(status_code=400, detail="请填写问题描述")
    if len(normalized_description) > MAX_DESCRIPTION_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"问题描述不能超过 {MAX_DESCRIPTION_LENGTH} 个字符",
        )

    attachments = files or []
    if len(attachments) > MAX_ATTACHMENTS:
        raise HTTPException(
            status_code=400,
            detail=f"单次最多只能上传 {MAX_ATTACHMENTS} 个文件",
        )

    feedback = IssueFeedback(
        user_id=current_user.id,
        description=normalized_description,
        status=IssueFeedbackStatusEnum.PENDING,
    )
    session.add(feedback)
    await session.flush()

    for upload in attachments:
        safe_name = _sanitize_filename(upload.filename or "attachment")
        media_type = _infer_media_type(upload, safe_name)
        _validate_media_type(media_type)

        content = await upload.read()
        file_size = len(content)
        if file_size > MAX_ATTACHMENT_SIZE_BYTES:
            raise HTTPException(status_code=400, detail="每个附件大小不能超过 50MB")

        attachment_id = uuid4()
        suffix = Path(safe_name).suffix.lower()
        stored_name = f"feedback-{feedback.id}-{attachment_id}{suffix}"
        await storage_service.save_file(flow_id=str(current_user.id), file_name=stored_name, data=content)

        session.add(
            IssueFeedbackAttachment(
                id=attachment_id,
                feedback_id=feedback.id,
                original_name=safe_name,
                storage_path=f"{current_user.id}/{stored_name}",
                content_type=media_type,
                file_size=file_size,
            )
        )

    superuser_ids = set(
        (
            await session.exec(
                select(User.id).where(
                    User.is_active == True,  # noqa: E712
                    User.is_superuser == True,  # noqa: E712
                )
            )
        ).all()
    )

    await _create_notification(
        session=session,
        created_by_id=current_user.id,
        recipient_user_ids=superuser_ids,
        title="收到新的问题反馈",
        content=(
            f"反馈人：{current_user.nickname or current_user.username}\n"
            f"状态：{_format_status_label(IssueFeedbackStatusEnum.PENDING)}\n"
            f"问题摘要：{_feedback_summary(normalized_description)}"
        ),
        link=f"/admin/users?focus=feedback&feedbackId={feedback.id}",
    )

    await session.commit()
    return await _fetch_feedback_read(feedback.id, session)


@router.get("/mine", response_model=list[IssueFeedbackRead], status_code=HTTPStatus.OK)
async def list_my_issue_feedbacks(
    session: DbSession,
    current_user: CurrentActiveUser,
):
    rows = (
        await session.exec(
            select(IssueFeedback, User.nickname, User.username)
            .join(User, User.id == IssueFeedback.user_id)
            .where(IssueFeedback.user_id == current_user.id)
            .order_by(IssueFeedback.updated_at.desc(), IssueFeedback.created_at.desc())
        )
    ).all()
    return await _build_feedback_reads(rows, session)


@router.get("/admin", response_model=list[IssueFeedbackRead], status_code=HTTPStatus.OK)
async def list_issue_feedbacks_for_admin(
    session: DbSession,
    current_user: CurrentActiveUser,
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="仅超级管理员可访问")

    rows = (
        await session.exec(
            select(IssueFeedback, User.nickname, User.username)
            .join(User, User.id == IssueFeedback.user_id)
            .order_by(IssueFeedback.updated_at.desc(), IssueFeedback.created_at.desc())
        )
    ).all()
    return await _build_feedback_reads(rows, session)


@router.patch("/{feedback_id}", response_model=IssueFeedbackRead, status_code=HTTPStatus.OK)
async def update_issue_feedback(
    feedback_id: UUID,
    payload: IssueFeedbackUpdate,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser only")

    feedback = await session.get(IssueFeedback, feedback_id)
    if not feedback:
        raise HTTPException(status_code=404, detail="反馈记录不存在")

    normalized_reply = payload.admin_reply.strip() if payload.admin_reply else ""
    next_status = payload.status or feedback.status
    status_changed = next_status != feedback.status
    reply_changed = bool(normalized_reply)

    if reply_changed and len(normalized_reply) > MAX_ADMIN_REPLY_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"管理员回复不能超过 {MAX_ADMIN_REPLY_LENGTH} 个字符",
        )

    if not status_changed and not reply_changed:
        raise HTTPException(status_code=400, detail="请至少更新状态或填写回复内容")

    feedback.status = next_status
    if reply_changed:
        feedback.latest_admin_reply = normalized_reply
        feedback.last_replied_by_id = current_user.id
        feedback.last_replied_at = utc_now()
    feedback.updated_at = utc_now()
    session.add(feedback)

    notification_lines = [f"Status: {_format_status_label(feedback.status)}"]
    if reply_changed:
        notification_lines = [f"处理状态：{_format_status_label(feedback.status)}"]
        notification_lines.append(f"管理员回复：{normalized_reply}")
    else:
        notification_lines = [f"处理状态：{_format_status_label(feedback.status)}"]

    await _create_notification(
        session=session,
        created_by_id=current_user.id,
        recipient_user_ids={feedback.user_id},
        title=f"问题反馈更新：{_format_status_label(feedback.status)}",
        content="\n".join(notification_lines),
    )

    await session.commit()
    return await _fetch_feedback_read(feedback.id, session)


@router.get(
    "/{feedback_id}/attachments/{attachment_id}/content",
    status_code=HTTPStatus.OK,
)
async def get_issue_feedback_attachment(
    feedback_id: UUID,
    attachment_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
    storage_service: StorageService = Depends(get_storage_service),
):
    feedback = await session.get(IssueFeedback, feedback_id)
    if not feedback:
        raise HTTPException(status_code=404, detail="反馈记录不存在")

    if not current_user.is_superuser and feedback.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="你没有权限查看该附件")

    attachment = (
        await session.exec(
            select(IssueFeedbackAttachment).where(
                IssueFeedbackAttachment.id == attachment_id,
                IssueFeedbackAttachment.feedback_id == feedback_id,
            )
        )
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="附件不存在")

    try:
        owner_id, stored_name = attachment.storage_path.split("/", 1)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="附件路径无效") from exc

    try:
        content = await storage_service.get_file(flow_id=owner_id, file_name=stored_name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="附件不存在") from exc

    encoded_name = quote(attachment.original_name)
    ascii_name = attachment.original_name.encode("ascii", "replace").decode("ascii")
    return StreamingResponse(
        _iter_bytes(content),
        media_type=attachment.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"inline; filename=\"{ascii_name}\"; filename*=utf-8''{encoded_name}",
        },
    )
