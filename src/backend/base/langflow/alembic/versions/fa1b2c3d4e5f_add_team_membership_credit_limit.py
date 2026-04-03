"""Add team membership credit limit

Revision ID: fa1b2c3d4e5f
Revises: f9b1c2d3e4f5
Create Date: 2026-04-02 20:45:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "fa1b2c3d4e5f"
down_revision: str | Sequence[str] | None = "f9b1c2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("team_membership", conn) and not migration.column_exists("team_membership", "credit_limit", conn):
        with op.batch_alter_table("team_membership", schema=None) as batch_op:
            batch_op.add_column(sa.Column("credit_limit", sa.Integer(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("team_membership", conn) and migration.column_exists("team_membership", "credit_limit", conn):
        with op.batch_alter_table("team_membership", schema=None) as batch_op:
            batch_op.drop_column("credit_limit")
