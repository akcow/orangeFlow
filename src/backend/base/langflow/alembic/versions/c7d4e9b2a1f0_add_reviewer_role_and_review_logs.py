"""Add reviewer role and community review log table

Revision ID: c7d4e9b2a1f0
Revises: beb51fe6c80e
Create Date: 2026-02-27 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "c7d4e9b2a1f0"
down_revision: str | None = "beb51fe6c80e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("user", conn) and not migration.column_exists("user", "is_reviewer", conn):
        with op.batch_alter_table("user", schema=None) as batch_op:
            batch_op.add_column(sa.Column("is_reviewer", sa.Boolean(), nullable=False, server_default=sa.false()))

    community_item_status_enum_create = sa.Enum("PRIVATE", "PUBLIC", "UNREVIEWED", name="community_item_status_enum")
    community_review_action_enum_create = sa.Enum("APPROVE", "REJECT", "HIDE", name="community_review_action_enum")
    try:
        community_item_status_enum_create.create(conn, checkfirst=True)
        community_review_action_enum_create.create(conn, checkfirst=True)
    except Exception:
        # Best effort for dialect differences.
        pass
    community_item_status_enum = postgresql.ENUM(
        "PRIVATE",
        "PUBLIC",
        "UNREVIEWED",
        name="community_item_status_enum",
        create_type=False,
    )
    community_review_action_enum = postgresql.ENUM(
        "APPROVE",
        "REJECT",
        "HIDE",
        name="community_review_action_enum",
        create_type=False,
    )

    if not migration.table_exists("community_item_review_log", conn):
        op.create_table(
            "community_item_review_log",
            sa.Column("item_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("reviewer_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("action", community_review_action_enum, nullable=False),
            sa.Column("from_status", community_item_status_enum, nullable=False),
            sa.Column("to_status", community_item_status_enum, nullable=False),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["item_id"], ["community_item.id"]),
            sa.ForeignKeyConstraint(["reviewer_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(conn)  # type: ignore[arg-type]
    index_names = {
        index.get("name")
        for index in (inspector.get_indexes("community_item_review_log") if migration.table_exists("community_item_review_log", conn) else [])
    }

    with op.batch_alter_table("community_item_review_log", schema=None) as batch_op:
        if "ix_community_item_review_log_item_id" not in index_names:
            batch_op.create_index("ix_community_item_review_log_item_id", ["item_id"], unique=False)
        if "ix_community_item_review_log_reviewer_id" not in index_names:
            batch_op.create_index("ix_community_item_review_log_reviewer_id", ["reviewer_id"], unique=False)
        if "ix_community_item_review_log_created_at" not in index_names:
            batch_op.create_index("ix_community_item_review_log_created_at", ["created_at"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("community_item_review_log", conn):
        inspector = sa.inspect(conn)  # type: ignore[arg-type]
        index_names = {index.get("name") for index in inspector.get_indexes("community_item_review_log")}
        if "ix_community_item_review_log_created_at" in index_names:
            op.drop_index("ix_community_item_review_log_created_at", table_name="community_item_review_log")
        if "ix_community_item_review_log_reviewer_id" in index_names:
            op.drop_index("ix_community_item_review_log_reviewer_id", table_name="community_item_review_log")
        if "ix_community_item_review_log_item_id" in index_names:
            op.drop_index("ix_community_item_review_log_item_id", table_name="community_item_review_log")
        op.drop_table("community_item_review_log")

    if migration.table_exists("user", conn) and migration.column_exists("user", "is_reviewer", conn):
        with op.batch_alter_table("user", schema=None) as batch_op:
            batch_op.drop_column("is_reviewer")

    community_review_action_enum = sa.Enum("APPROVE", "REJECT", "HIDE", name="community_review_action_enum")
    try:
        community_review_action_enum.drop(conn, checkfirst=True)
    except Exception:
        pass
