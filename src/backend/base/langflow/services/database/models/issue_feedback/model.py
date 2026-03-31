from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import UUID, uuid4

from pydantic import field_serializer
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import Column, DateTime, Text
from sqlmodel import Field, SQLModel


class IssueFeedbackStatusEnum(str, Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class IssueFeedbackBase(SQLModel):
    user_id: UUID = Field(foreign_key="user.id", index=True)
    description: str = Field(sa_column=Column(Text, nullable=False))
    status: IssueFeedbackStatusEnum = Field(
        default=IssueFeedbackStatusEnum.PENDING,
        sa_column=Column(
            SQLEnum(
                IssueFeedbackStatusEnum,
                name="issue_feedback_status_enum",
                values_callable=lambda enum: [member.value for member in enum],
            ),
            nullable=False,
            index=True,
        ),
    )
    latest_admin_reply: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    last_replied_by_id: UUID | None = Field(default=None, foreign_key="user.id", nullable=True, index=True)
    last_replied_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )

    @field_serializer("created_at", "updated_at", "last_replied_at")
    def _serialize_datetimes(self, value: datetime | None):
        if value is None:
            return None
        value = value.replace(microsecond=0)
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()


class IssueFeedback(IssueFeedbackBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "issue_feedback"

    id: UUID = Field(default_factory=uuid4, primary_key=True)


class IssueFeedbackAttachmentBase(SQLModel):
    feedback_id: UUID = Field(foreign_key="issue_feedback.id", index=True)
    original_name: str = Field(max_length=255)
    storage_path: str = Field(max_length=512)
    content_type: str = Field(max_length=255)
    file_size: int = Field(nullable=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime):
        value = value.replace(microsecond=0)
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()


class IssueFeedbackAttachment(IssueFeedbackAttachmentBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "issue_feedback_attachment"

    id: UUID = Field(default_factory=uuid4, primary_key=True)


class IssueFeedbackAttachmentRead(SQLModel):
    id: UUID
    original_name: str
    content_type: str
    file_size: int
    created_at: datetime
    preview_url: str


class IssueFeedbackRead(SQLModel):
    id: UUID
    user_id: UUID
    reporter_name: str
    reporter_username: str
    description: str
    status: IssueFeedbackStatusEnum
    latest_admin_reply: str | None = None
    last_replied_by_name: str | None = None
    last_replied_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    attachments: list[IssueFeedbackAttachmentRead] = Field(default_factory=list)


class IssueFeedbackUpdate(SQLModel):
    status: IssueFeedbackStatusEnum | None = None
    admin_reply: str | None = None
