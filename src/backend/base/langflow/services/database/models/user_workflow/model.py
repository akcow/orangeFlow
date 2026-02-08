from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from pydantic import ConfigDict
import sqlalchemy as sa
from sqlmodel import JSON, Column, Field, SQLModel


class UserWorkflowBase(SQLModel):
    name: str = Field(index=True, min_length=1, max_length=200)
    # Use TEXT in the DB (migration uses sa.Text). Keep max_length for validation only.
    note: str | None = Field(default=None, max_length=2000, sa_column=Column(sa.Text(), nullable=True))
    # Keep these JSON fields non-null in the DB to match alembic migrations.
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))

    cover: dict[str, Any] = Field(
        default_factory=lambda: {"kind": "default"},
        sa_column=Column(JSON, nullable=False),
    )

    # WorkflowSelection (frontend) payload: { nodes: [...], edges: [...] }
    selection: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))

    resource_map: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_used_at: datetime | None = Field(default=None, nullable=True)

    model_config = ConfigDict(arbitrary_types_allowed=True)


class UserWorkflow(UserWorkflowBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "user_workflow"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)


class UserWorkflowCreate(SQLModel):
    name: str = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=2000)
    tags: list[str] = Field(default_factory=list)
    cover: dict[str, Any] = Field(default_factory=lambda: {"kind": "default"})
    selection: dict[str, Any]
    resource_map: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(arbitrary_types_allowed=True)


class UserWorkflowUpdate(SQLModel):
    name: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = None
    cover: dict[str, Any] | None = None
    selection: dict[str, Any] | None = None
    resource_map: dict[str, Any] | None = None

    model_config = ConfigDict(arbitrary_types_allowed=True)


class UserWorkflowRead(UserWorkflowBase):
    id: UUID
    user_id: UUID
