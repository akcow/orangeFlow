from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from pydantic import ConfigDict
from sqlmodel import JSON, Column, Field, SQLModel


class UserAssetBase(SQLModel):
    name: str = Field(index=True, min_length=1, max_length=200)
    category: str = Field(default="其他", max_length=80)
    # Keep these JSON fields non-null in the DB to match alembic migrations.
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))

    # cover is a JSON union used by the frontend:
    # - { kind: "default" }
    # - { kind: "url", url: string }
    # - { kind: "asset", assetId: string }   # assetId is a v2 file_id
    cover: dict[str, Any] = Field(
        default_factory=lambda: {"kind": "default"},
        sa_column=Column(JSON, nullable=False),
    )

    # NodeDataType (frontend) payload
    data: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))

    # Records packaged resources for debugging & future rewrites.
    resource_map: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True), nullable=False),
    )
    last_used_at: datetime | None = Field(default=None, sa_column=Column(sa.DateTime(timezone=True), nullable=True))

    model_config = ConfigDict(arbitrary_types_allowed=True)


class UserAsset(UserAssetBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "user_asset"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)


class UserAssetCreate(SQLModel):
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(default="其他", max_length=80)
    tags: list[str] = Field(default_factory=list)
    cover: dict[str, Any] = Field(default_factory=lambda: {"kind": "default"})
    data: dict[str, Any]
    resource_map: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(arbitrary_types_allowed=True)


class UserAssetUpdate(SQLModel):
    name: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=80)
    tags: list[str] | None = None
    cover: dict[str, Any] | None = None
    data: dict[str, Any] | None = None
    resource_map: dict[str, Any] | None = None

    model_config = ConfigDict(arbitrary_types_allowed=True)


class UserAssetRead(UserAssetBase):
    id: UUID
    user_id: UUID
