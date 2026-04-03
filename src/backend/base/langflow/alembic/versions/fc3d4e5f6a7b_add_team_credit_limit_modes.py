"""Add team credit limit modes

Revision ID: fc3d4e5f6a7b
Revises: fb2c3d4e5f6a
Create Date: 2026-04-03 11:20:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "fc3d4e5f6a7b"
down_revision: str | Sequence[str] | None = "fb2c3d4e5f6a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


team_credit_limit_kind_enum = sa.Enum(
    "UNLIMITED",
    "RECURRING",
    "FIXED",
    name="team_credit_limit_kind_enum",
)
team_credit_limit_interval_enum = sa.Enum(
    "MONTHLY",
    name="team_credit_limit_interval_enum",
)


def upgrade() -> None:
    conn = op.get_bind()

    if not migration.table_exists("team_membership", conn):
        return

    team_credit_limit_kind_enum_create = sa.Enum(
        "UNLIMITED",
        "RECURRING",
        "FIXED",
        name="team_credit_limit_kind_enum",
    )
    team_credit_limit_interval_enum_create = sa.Enum(
        "MONTHLY",
        name="team_credit_limit_interval_enum",
    )

    if conn.dialect.name == "postgresql":
        team_credit_limit_kind_enum_create.create(conn, checkfirst=True)
        team_credit_limit_interval_enum_create.create(conn, checkfirst=True)
        team_credit_limit_kind_column_type = postgresql.ENUM(
            "UNLIMITED",
            "RECURRING",
            "FIXED",
            name="team_credit_limit_kind_enum",
            create_type=False,
        )
        team_credit_limit_interval_column_type = postgresql.ENUM(
            "MONTHLY",
            name="team_credit_limit_interval_enum",
            create_type=False,
        )
    else:
        team_credit_limit_kind_column_type = team_credit_limit_kind_enum
        team_credit_limit_interval_column_type = team_credit_limit_interval_enum

    if not migration.column_exists("team_membership", "credit_limit_kind", conn):
        with op.batch_alter_table("team_membership", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column(
                    "credit_limit_kind",
                    team_credit_limit_kind_column_type,
                    nullable=False,
                    server_default=sa.text("'UNLIMITED'"),
                )
            )

    if not migration.column_exists("team_membership", "credit_limit_interval", conn):
        with op.batch_alter_table("team_membership", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column(
                    "credit_limit_interval",
                    team_credit_limit_interval_column_type,
                    nullable=True,
                )
            )

    conn.execute(
        sa.text(
            """
            UPDATE team_membership
            SET credit_limit_kind = 'FIXED'
            WHERE credit_limit IS NOT NULL
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE team_membership
            SET credit_limit_interval = 'MONTHLY'
            WHERE credit_limit_kind = 'RECURRING'
              AND credit_limit_interval IS NULL
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()

    if not migration.table_exists("team_membership", conn):
        return

    if migration.column_exists("team_membership", "credit_limit_interval", conn):
        with op.batch_alter_table("team_membership", schema=None) as batch_op:
            batch_op.drop_column("credit_limit_interval")

    if migration.column_exists("team_membership", "credit_limit_kind", conn):
        with op.batch_alter_table("team_membership", schema=None) as batch_op:
            batch_op.drop_column("credit_limit_kind")

    if conn.dialect.name == "postgresql":
        team_credit_limit_interval_enum.drop(conn, checkfirst=True)
        team_credit_limit_kind_enum.drop(conn, checkfirst=True)
