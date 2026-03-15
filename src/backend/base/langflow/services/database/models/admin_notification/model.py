from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import UUID, uuid4

from pydantic import field_serializer
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import Column, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class AdminNotificationTargetType(str, Enum):
    ALL = "ALL"
    USERS = "USERS"
    TEAMS = "TEAMS"


class AdminNotificationBase(SQLModel):
    title: str = Field(min_length=1, max_length=120, index=True)
    content: str = Field(sa_column=Column(Text, nullable=False))
    link: str | None = Field(default=None, max_length=500)
    created_by_id: UUID = Field(foreign_key="user.id", index=True)
    target_type: AdminNotificationTargetType = Field(
        sa_column=Column(
            SQLEnum(
                AdminNotificationTargetType,
                name="admin_notification_target_type_enum",
                values_callable=lambda enum: [member.value for member in enum],
            ),
            nullable=False,
        ),
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    expires_at: datetime = Field(index=True)

    @field_serializer("created_at", "expires_at")
    def _serialize_datetimes(self, value: datetime):
        value = value.replace(microsecond=0)
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()


class AdminNotification(AdminNotificationBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "admin_notification"

    id: UUID = Field(default_factory=uuid4, primary_key=True)


class AdminNotificationUserTarget(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "admin_notification_user_target"
    __table_args__ = (UniqueConstraint("notification_id", "user_id", name="uq_admin_notification_user_target"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    notification_id: UUID = Field(foreign_key="admin_notification.id", index=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)


class AdminNotificationTeamTarget(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "admin_notification_team_target"
    __table_args__ = (UniqueConstraint("notification_id", "folder_id", name="uq_admin_notification_team_target"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    notification_id: UUID = Field(foreign_key="admin_notification.id", index=True)
    folder_id: UUID = Field(foreign_key="folder.id", index=True)


class AdminNotificationRecipient(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "admin_notification_recipient"
    __table_args__ = (UniqueConstraint("notification_id", "user_id", name="uq_admin_notification_recipient"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    notification_id: UUID = Field(foreign_key="admin_notification.id", index=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    read_at: datetime | None = Field(default=None, nullable=True, index=True)
    hidden_at: datetime | None = Field(default=None, nullable=True, index=True)

    @field_serializer("created_at", "read_at", "hidden_at")
    def _serialize_optional_datetimes(self, value: datetime | None):
        if value is None:
            return None
        value = value.replace(microsecond=0)
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
