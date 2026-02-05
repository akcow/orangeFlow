from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from pydantic import field_serializer
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import Text, text
from sqlmodel import Column, Field, SQLModel

if TYPE_CHECKING:
    from langflow.services.database.models.flow.model import Flow
    from langflow.services.database.models.user.model import User


class CommunityItemTypeEnum(str, Enum):
    TV = "TV"
    WORKFLOW = "WORKFLOW"


class CommunityItemStatusEnum(str, Enum):
    PRIVATE = "PRIVATE"
    PUBLIC = "PUBLIC"
    UNREVIEWED = "UNREVIEWED"


class CommunityItemBase(SQLModel):
    type: CommunityItemTypeEnum = Field(
        sa_column=Column(
            SQLEnum(
                CommunityItemTypeEnum,
                name="community_item_type_enum",
                values_callable=lambda enum: [m.value for m in enum],
            ),
            nullable=False,
        ),
    )
    status: CommunityItemStatusEnum = Field(
        default=CommunityItemStatusEnum.UNREVIEWED,
        sa_column=Column(
            SQLEnum(
                CommunityItemStatusEnum,
                name="community_item_status_enum",
                values_callable=lambda enum: [m.value for m in enum],
            ),
            nullable=False,
            server_default=text("'UNREVIEWED'"),
        ),
    )

    title: str = Field(index=True, min_length=1, max_length=80)
    description: str | None = Field(default=None, sa_column=Column(Text, nullable=True))

    flow_id: UUID = Field(foreign_key="flow.id", index=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)

    # Stored as the StorageService path returned by /api/v1/files/upload/{flow_id}
    # e.g. "{flow_id}/{timestamp}_{filename}.png"
    cover_path: str | None = Field(default=None, nullable=True)
    media_path: str | None = Field(default=None, nullable=True)

    # If true, approval will also make the referenced flow publicly readable via /flows/public_flow/{id}.
    public_canvas: bool = Field(default=False, nullable=False)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    # Keep this unindexed to avoid model/db drift across existing deployments.
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_serializer("created_at", "updated_at")
    def _serialize_dt(self, value: datetime):
        value = value.replace(microsecond=0)
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()


class CommunityItem(CommunityItemBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "community_item"
    id: UUID = Field(default_factory=uuid4, primary_key=True)


class CommunityItemCreate(SQLModel):
    type: CommunityItemTypeEnum
    flow_id: UUID
    title: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    cover_path: str | None = None
    media_path: str | None = None
    public_canvas: bool = False
    # Optional: allow saving as PRIVATE draft instead of submitting for review.
    status: CommunityItemStatusEnum | None = None


class CommunityItemRead(CommunityItemBase):
    id: UUID


class CommunityItemUpdate(SQLModel):
    title: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    cover_path: str | None = None
    media_path: str | None = None
    public_canvas: bool | None = None
    status: CommunityItemStatusEnum | None = None
