"""Add issue feedback system

Revision ID: e6f7a8b9c0d1
Revises: d4e5f6a7b8c9
Create Date: 2026-03-31 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _index_names(conn, table_name: str) -> set[str]:
    inspector = sa.inspect(conn)  # type: ignore[arg-type]
    return {index.get("name") for index in inspector.get_indexes(table_name)}


def _ensure_index(table_name: str, index_name: str, columns: list[str]) -> None:
    conn = op.get_bind()
    if migration.table_exists(table_name, conn) and index_name not in _index_names(conn, table_name):
        op.create_index(index_name, table_name, columns, unique=False)


def upgrade() -> None:
    conn = op.get_bind()

    feedback_status_enum_create = sa.Enum(
        "PENDING",
        "IN_PROGRESS",
        "RESOLVED",
        "CLOSED",
        name="issue_feedback_status_enum",
    )
    try:
        feedback_status_enum_create.create(conn, checkfirst=True)
    except Exception:
        pass

    if conn.dialect.name == "postgresql":
        feedback_status_enum = postgresql.ENUM(
            "PENDING",
            "IN_PROGRESS",
            "RESOLVED",
            "CLOSED",
            name="issue_feedback_status_enum",
            create_type=False,
        )
    else:
        feedback_status_enum = sa.Enum(
            "PENDING",
            "IN_PROGRESS",
            "RESOLVED",
            "CLOSED",
            name="issue_feedback_status_enum",
        )

    if not migration.table_exists("issue_feedback", conn):
        op.create_table(
            "issue_feedback",
            sa.Column("user_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("status", feedback_status_enum, nullable=False),
            sa.Column("latest_admin_reply", sa.Text(), nullable=True),
            sa.Column("last_replied_by_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=True),
            sa.Column("last_replied_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.ForeignKeyConstraint(["last_replied_by_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    _ensure_index("issue_feedback", "ix_issue_feedback_user_id", ["user_id"])
    _ensure_index("issue_feedback", "ix_issue_feedback_status", ["status"])
    _ensure_index("issue_feedback", "ix_issue_feedback_last_replied_by_id", ["last_replied_by_id"])
    _ensure_index("issue_feedback", "ix_issue_feedback_created_at", ["created_at"])
    _ensure_index("issue_feedback", "ix_issue_feedback_updated_at", ["updated_at"])

    if not migration.table_exists("issue_feedback_attachment", conn):
        op.create_table(
            "issue_feedback_attachment",
            sa.Column("feedback_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("original_name", sa.String(length=255), nullable=False),
            sa.Column("storage_path", sa.String(length=512), nullable=False),
            sa.Column("content_type", sa.String(length=255), nullable=False),
            sa.Column("file_size", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["feedback_id"], ["issue_feedback.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    _ensure_index("issue_feedback_attachment", "ix_issue_feedback_attachment_feedback_id", ["feedback_id"])
    _ensure_index("issue_feedback_attachment", "ix_issue_feedback_attachment_created_at", ["created_at"])


def downgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("issue_feedback_attachment", conn):
        for index_name in [
            "ix_issue_feedback_attachment_created_at",
            "ix_issue_feedback_attachment_feedback_id",
        ]:
            if index_name in _index_names(conn, "issue_feedback_attachment"):
                op.drop_index(index_name, table_name="issue_feedback_attachment")
        op.drop_table("issue_feedback_attachment")

    if migration.table_exists("issue_feedback", conn):
        for index_name in [
            "ix_issue_feedback_updated_at",
            "ix_issue_feedback_created_at",
            "ix_issue_feedback_last_replied_by_id",
            "ix_issue_feedback_status",
            "ix_issue_feedback_user_id",
        ]:
            if index_name in _index_names(conn, "issue_feedback"):
                op.drop_index(index_name, table_name="issue_feedback")
        op.drop_table("issue_feedback")

    feedback_status_enum = sa.Enum(
        "PENDING",
        "IN_PROGRESS",
        "RESOLVED",
        "CLOSED",
        name="issue_feedback_status_enum",
    )
    try:
        feedback_status_enum.drop(conn, checkfirst=True)
    except Exception:
        pass
