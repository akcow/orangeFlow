"""Add TV metrics fields and likes table for community items

Revision ID: e8f2c1a9d4b7
Revises: d4a3b6e9f1c2
Create Date: 2026-02-28 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "e8f2c1a9d4b7"
down_revision: str | None = "d4a3b6e9f1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("community_item", conn):
        with op.batch_alter_table("community_item", schema=None) as batch_op:
            if not migration.column_exists("community_item", "view_count", conn):
                batch_op.add_column(sa.Column("view_count", sa.Integer(), nullable=False, server_default=sa.text("0")))
            if not migration.column_exists("community_item", "like_count", conn):
                batch_op.add_column(sa.Column("like_count", sa.Integer(), nullable=False, server_default=sa.text("0")))

        op.execute(sa.text("UPDATE community_item SET view_count = 0 WHERE view_count IS NULL"))
        op.execute(sa.text("UPDATE community_item SET like_count = 0 WHERE like_count IS NULL"))

    if not migration.table_exists("community_item_like", conn):
        op.create_table(
            "community_item_like",
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("item_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("user_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["item_id"], ["community_item.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("item_id", "user_id", name="uq_community_item_like_item_user"),
        )

    inspector = sa.inspect(conn)  # type: ignore[arg-type]
    index_names = {
        index.get("name")
        for index in (inspector.get_indexes("community_item_like") if migration.table_exists("community_item_like", conn) else [])
    }

    with op.batch_alter_table("community_item_like", schema=None) as batch_op:
        if "ix_community_item_like_item_id" not in index_names:
            batch_op.create_index("ix_community_item_like_item_id", ["item_id"], unique=False)
        if "ix_community_item_like_user_id" not in index_names:
            batch_op.create_index("ix_community_item_like_user_id", ["user_id"], unique=False)
        if "ix_community_item_like_created_at" not in index_names:
            batch_op.create_index("ix_community_item_like_created_at", ["created_at"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("community_item_like", conn):
        inspector = sa.inspect(conn)  # type: ignore[arg-type]
        index_names = {index.get("name") for index in inspector.get_indexes("community_item_like")}
        if "ix_community_item_like_created_at" in index_names:
            op.drop_index("ix_community_item_like_created_at", table_name="community_item_like")
        if "ix_community_item_like_user_id" in index_names:
            op.drop_index("ix_community_item_like_user_id", table_name="community_item_like")
        if "ix_community_item_like_item_id" in index_names:
            op.drop_index("ix_community_item_like_item_id", table_name="community_item_like")
        op.drop_table("community_item_like")

    if migration.table_exists("community_item", conn):
        with op.batch_alter_table("community_item", schema=None) as batch_op:
            if migration.column_exists("community_item", "like_count", conn):
                batch_op.drop_column("like_count")
            if migration.column_exists("community_item", "view_count", conn):
                batch_op.drop_column("view_count")
