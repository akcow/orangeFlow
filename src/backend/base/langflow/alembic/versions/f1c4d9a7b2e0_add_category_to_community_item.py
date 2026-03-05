"""Add category field to community_item

Revision ID: f1c4d9a7b2e0
Revises: e8f2c1a9d4b7
Create Date: 2026-03-05 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "f1c4d9a7b2e0"
down_revision: str | None = "e8f2c1a9d4b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    if not migration.table_exists("community_item", conn):
        return

    if not migration.column_exists("community_item", "category", conn):
        with op.batch_alter_table("community_item", schema=None) as batch_op:
            batch_op.add_column(sa.Column("category", sa.String(length=40), nullable=True))

    inspector = sa.inspect(conn)  # type: ignore[arg-type]
    index_names = {index.get("name") for index in inspector.get_indexes("community_item")}
    if "ix_community_item_category" not in index_names:
        with op.batch_alter_table("community_item", schema=None) as batch_op:
            batch_op.create_index("ix_community_item_category", ["category"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    if not migration.table_exists("community_item", conn):
        return

    inspector = sa.inspect(conn)  # type: ignore[arg-type]
    index_names = {index.get("name") for index in inspector.get_indexes("community_item")}
    if "ix_community_item_category" in index_names:
        op.drop_index("ix_community_item_category", table_name="community_item")

    if migration.column_exists("community_item", "category", conn):
        with op.batch_alter_table("community_item", schema=None) as batch_op:
            batch_op.drop_column("category")

