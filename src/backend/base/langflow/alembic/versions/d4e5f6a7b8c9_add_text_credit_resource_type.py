"""Add TEXT credit resource type

Revision ID: d4e5f6a7b8c9
Revises: c9f8a1b2d3e4
Create Date: 2026-03-17 00:10:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c9f8a1b2d3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        op.execute("ALTER TYPE credit_resource_type_enum ADD VALUE IF NOT EXISTS 'TEXT'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed cheaply in-place.
    # Keep downgrade as a no-op to avoid destructive type recreation.
    return None
