"""Backfill owner team memberships for legacy folders

Revision ID: fb2c3d4e5f6a
Revises: fa1b2c3d4e5f
Create Date: 2026-04-02 23:10:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "fb2c3d4e5f6a"
down_revision: str | Sequence[str] | None = "fa1b2c3d4e5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


folder_table = sa.table(
    "folder",
    sa.column("id", sa.String()),
    sa.column("user_id", sa.String()),
)

team_membership_table = sa.table(
    "team_membership",
    sa.column("id", sa.String()),
    sa.column("folder_id", sa.String()),
    sa.column("user_id", sa.String()),
    sa.column("role", sa.String()),
    sa.column("credit_limit", sa.Integer()),
    sa.column("created_at", sa.DateTime(timezone=True)),
)


def upgrade() -> None:
    conn = op.get_bind()
    if not migration.table_exists("folder", conn) or not migration.table_exists("team_membership", conn):
        return

    rows = conn.execute(
        sa.text(
            """
            SELECT f.id AS folder_id, f.user_id AS user_id
            FROM folder AS f
            LEFT JOIN team_membership AS tm
              ON tm.folder_id = f.id
             AND tm.user_id = f.user_id
            WHERE f.user_id IS NOT NULL
              AND tm.id IS NULL
            """
        )
    ).mappings()

    now = datetime.now(timezone.utc)
    missing_owner_memberships = [
        {
            "id": str(uuid4()),
            "folder_id": str(row["folder_id"]),
            "user_id": str(row["user_id"]),
            "role": "OWNER",
            "credit_limit": None,
            "created_at": now,
        }
        for row in rows
    ]

    if missing_owner_memberships:
        op.bulk_insert(team_membership_table, missing_owner_memberships)


def downgrade() -> None:
    # Irreversible data backfill.
    return
