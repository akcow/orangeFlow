"""Add flow_snapshot to community_item for stable moderation preview

Revision ID: d4a3b6e9f1c2
Revises: c7d4e9b2a1f0
Create Date: 2026-02-28 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "d4a3b6e9f1c2"
down_revision: str | None = "c7d4e9b2a1f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    if not migration.table_exists("community_item", conn):
        return

    if not migration.column_exists("community_item", "flow_snapshot", conn):
        with op.batch_alter_table("community_item", schema=None) as batch_op:
            batch_op.add_column(sa.Column("flow_snapshot", sa.JSON(), nullable=True))

    # Backfill existing submissions so old records are also reviewable.
    op.execute(
        sa.text(
            """
            UPDATE community_item
            SET flow_snapshot = (
                SELECT flow.data
                FROM flow
                WHERE flow.id = community_item.flow_id
            )
            WHERE flow_snapshot IS NULL
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    if migration.table_exists("community_item", conn) and migration.column_exists("community_item", "flow_snapshot", conn):
        with op.batch_alter_table("community_item", schema=None) as batch_op:
            batch_op.drop_column("flow_snapshot")
