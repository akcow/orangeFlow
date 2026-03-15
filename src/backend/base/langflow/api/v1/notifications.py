from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlmodel import select

from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.services.database.models.admin_notification.model import (
    AdminNotification,
    AdminNotificationRecipient,
    AdminNotificationTargetType,
    AdminNotificationTeamTarget,
    AdminNotificationUserTarget,
)
from langflow.services.database.models.folder.model import Folder
from langflow.services.database.models.team_membership.model import TeamMembership
from langflow.services.database.models.user.model import User

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CreateAdminNotificationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1)
    link: str | None = Field(default=None, max_length=500)
    target_type: AdminNotificationTargetType
    user_ids: list[UUID] = Field(default_factory=list)
    team_ids: list[UUID] = Field(default_factory=list)


class AdminNotificationResponse(BaseModel):
    id: UUID
    title: str
    content: str
    link: str | None = None
    target_type: AdminNotificationTargetType
    created_at: str
    expires_at: str
    recipient_count: int


class AdminNotificationHistoryResponse(BaseModel):
    id: UUID
    title: str
    content: str
    link: str | None = None
    target_type: AdminNotificationTargetType
    created_at: str
    expires_at: str
    created_by_name: str
    recipient_count: int
    read_count: int
    hidden_count: int


class UserNotificationResponse(BaseModel):
    recipient_id: UUID
    notification_id: UUID
    title: str
    content: str
    link: str | None = None
    target_type: AdminNotificationTargetType
    created_at: str
    expires_at: str
    read_at: str | None = None
    sender_name: str


@router.post("/", response_model=AdminNotificationResponse, status_code=201)
async def create_admin_notification(
    payload: CreateAdminNotificationRequest,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser only")

    if payload.target_type == AdminNotificationTargetType.USERS and not payload.user_ids:
        raise HTTPException(status_code=400, detail="user_ids is required")
    if payload.target_type == AdminNotificationTargetType.TEAMS and not payload.team_ids:
        raise HTTPException(status_code=400, detail="team_ids is required")

    recipient_user_ids: set[UUID] = set()
    normalized_user_ids = list(dict.fromkeys(payload.user_ids))
    normalized_team_ids = list(dict.fromkeys(payload.team_ids))

    if payload.target_type == AdminNotificationTargetType.ALL:
        recipient_user_ids.update(
            (await session.exec(select(User.id).where(User.is_active == True))).all()  # noqa: E712
        )
    elif payload.target_type == AdminNotificationTargetType.USERS:
        existing_users = (
            await session.exec(
                select(User.id).where(
                    User.id.in_(normalized_user_ids),  # type: ignore[attr-defined]
                    User.is_active == True,  # noqa: E712
                )
            )
        ).all()
        recipient_user_ids.update(existing_users)
    else:
        existing_teams = (
            await session.exec(select(Folder.id).where(Folder.id.in_(normalized_team_ids)))  # type: ignore[attr-defined]
        ).all()
        if not existing_teams:
            raise HTTPException(status_code=404, detail="No target teams found")
        recipient_user_ids.update(
            (
                await session.exec(
                    select(TeamMembership.user_id)
                    .where(TeamMembership.folder_id.in_(existing_teams))  # type: ignore[attr-defined]
                    .distinct()
                )
            ).all()
        )

    if not recipient_user_ids:
        raise HTTPException(status_code=400, detail="No active recipients found")

    notification = AdminNotification(
        title=payload.title.strip(),
        content=payload.content.strip(),
        link=payload.link.strip() if payload.link else None,
        created_by_id=current_user.id,
        target_type=payload.target_type,
        expires_at=utc_now() + timedelta(days=7),
    )
    session.add(notification)
    await session.flush()

    if payload.target_type == AdminNotificationTargetType.USERS:
        for user_id in existing_users:
            session.add(AdminNotificationUserTarget(notification_id=notification.id, user_id=user_id))
    elif payload.target_type == AdminNotificationTargetType.TEAMS:
        for team_id in existing_teams:
            session.add(AdminNotificationTeamTarget(notification_id=notification.id, folder_id=team_id))

    for user_id in recipient_user_ids:
        session.add(AdminNotificationRecipient(notification_id=notification.id, user_id=user_id))
    await session.commit()
    await session.refresh(notification)

    return AdminNotificationResponse(
        id=notification.id,
        title=notification.title,
        content=notification.content,
        link=notification.link,
        target_type=notification.target_type,
        created_at=notification.created_at.replace(microsecond=0).isoformat(),
        expires_at=notification.expires_at.replace(microsecond=0).isoformat(),
        recipient_count=len(recipient_user_ids),
    )


@router.get("/admin", response_model=list[AdminNotificationHistoryResponse], status_code=200)
async def list_admin_notifications(
    session: DbSession,
    current_user: CurrentActiveUser,
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser only")

    rows = (
        await session.exec(
            select(AdminNotification, User.nickname)
            .join(User, User.id == AdminNotification.created_by_id)
            .order_by(AdminNotification.created_at.desc())
        )
    ).all()

    recipient_counts = {
        notification_id: count
        for notification_id, count in (
            await session.exec(
                select(
                    AdminNotificationRecipient.notification_id,
                    func.count(AdminNotificationRecipient.id),
                )
                .group_by(AdminNotificationRecipient.notification_id)
            )
        ).all()
    }
    read_counts = {
        notification_id: count
        for notification_id, count in (
            await session.exec(
                select(
                    AdminNotificationRecipient.notification_id,
                    func.count(AdminNotificationRecipient.id),
                )
                .where(AdminNotificationRecipient.read_at != None)  # noqa: E711
                .group_by(AdminNotificationRecipient.notification_id)
            )
        ).all()
    }
    hidden_counts = {
        notification_id: count
        for notification_id, count in (
            await session.exec(
                select(
                    AdminNotificationRecipient.notification_id,
                    func.count(AdminNotificationRecipient.id),
                )
                .where(AdminNotificationRecipient.hidden_at != None)  # noqa: E711
                .group_by(AdminNotificationRecipient.notification_id)
            )
        ).all()
    }

    return [
        AdminNotificationHistoryResponse(
            id=notification.id,
            title=notification.title,
            content=notification.content,
            link=notification.link,
            target_type=notification.target_type,
            created_at=notification.created_at.replace(microsecond=0).isoformat(),
            expires_at=notification.expires_at.replace(microsecond=0).isoformat(),
            created_by_name=creator_name,
            recipient_count=int(recipient_counts.get(notification.id, 0) or 0),
            read_count=int(read_counts.get(notification.id, 0) or 0),
            hidden_count=int(hidden_counts.get(notification.id, 0) or 0),
        )
        for notification, creator_name in rows
    ]


@router.get("/mine", response_model=list[UserNotificationResponse], status_code=200)
async def list_my_notifications(
    session: DbSession,
    current_user: CurrentActiveUser,
):
    rows = (
        await session.exec(
            select(AdminNotificationRecipient, AdminNotification, User.nickname)
            .join(AdminNotification, AdminNotification.id == AdminNotificationRecipient.notification_id)
            .join(User, User.id == AdminNotification.created_by_id)
            .where(
                AdminNotificationRecipient.user_id == current_user.id,
                AdminNotificationRecipient.hidden_at == None,  # noqa: E711
                AdminNotification.expires_at > utc_now(),
            )
            .order_by(AdminNotification.created_at.desc())
        )
    ).all()

    return [
        UserNotificationResponse(
            recipient_id=recipient.id,
            notification_id=notification.id,
            title=notification.title,
            content=notification.content,
            link=notification.link,
            target_type=notification.target_type,
            created_at=notification.created_at.replace(microsecond=0).isoformat(),
            expires_at=notification.expires_at.replace(microsecond=0).isoformat(),
            read_at=recipient.read_at.replace(microsecond=0).isoformat() if recipient.read_at else None,
            sender_name=creator_name,
        )
        for recipient, notification, creator_name in rows
    ]


@router.post("/mine/read-all", status_code=200)
async def mark_my_notifications_read(
    session: DbSession,
    current_user: CurrentActiveUser,
):
    unread_recipients = (
        await session.exec(
            select(AdminNotificationRecipient)
            .join(AdminNotification, AdminNotification.id == AdminNotificationRecipient.notification_id)
            .where(
                AdminNotificationRecipient.user_id == current_user.id,
                AdminNotificationRecipient.hidden_at == None,  # noqa: E711
                AdminNotificationRecipient.read_at == None,  # noqa: E711
                AdminNotification.expires_at > utc_now(),
            )
        )
    ).all()

    current_time = utc_now()
    for recipient in unread_recipients:
        recipient.read_at = current_time
        session.add(recipient)
    await session.commit()

    return {"updated_count": len(unread_recipients)}


@router.delete("/mine/{recipient_id}", status_code=200)
async def hide_my_notification(
    recipient_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    recipient = (
        await session.exec(
            select(AdminNotificationRecipient).where(
                AdminNotificationRecipient.id == recipient_id,
                AdminNotificationRecipient.user_id == current_user.id,
            )
        )
    ).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Notification not found")

    recipient.hidden_at = utc_now()
    session.add(recipient)
    await session.commit()
    return {"detail": "Notification hidden"}
