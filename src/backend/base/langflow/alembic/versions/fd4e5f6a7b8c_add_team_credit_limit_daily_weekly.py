"""Add daily and weekly team credit limit intervals

Revision ID: fd4e5f6a7b8c
Revises: fc3d4e5f6a7b
Create Date: 2026-04-03 12:50:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fd4e5f6a7b8c"
down_revision: str | Sequence[str] | None = "fc3d4e5f6a7b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        op.execute("ALTER TYPE team_credit_limit_interval_enum ADD VALUE IF NOT EXISTS 'DAILY'")
        op.execute("ALTER TYPE team_credit_limit_interval_enum ADD VALUE IF NOT EXISTS 'WEEKLY'")


def downgrade() -> None:
    # PostgreSQL enum values are intentionally left in place on downgrade.
    return
