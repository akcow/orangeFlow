"""Add nickname column to user and enforce uniqueness

Revision ID: a4c1b2d3e4f5
Revises: 4c9e3b6d7f12
Create Date: 2026-03-11 12:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "a4c1b2d3e4f5"
down_revision: str | None = "4c9e3b6d7f12"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("user", conn) and not migration.column_exists("user", "nickname", conn):
        with op.batch_alter_table("user", schema=None) as batch_op:
            batch_op.add_column(sa.Column("nickname", sa.String(), nullable=True))

    if migration.table_exists("user", conn) and migration.column_exists("user", "nickname", conn):
        op.execute(sa.text("UPDATE \"user\" SET nickname = username WHERE nickname IS NULL OR nickname = ''"))

        with op.batch_alter_table("user", schema=None) as batch_op:
            batch_op.alter_column("nickname", existing_type=sa.String(), nullable=False)

        inspector = sa.inspect(conn)  # type: ignore[arg-type]
        index_names = {index.get("name") for index in inspector.get_indexes("user")}
        if "ix_user_nickname" not in index_names:
            with op.batch_alter_table("user", schema=None) as batch_op:
                batch_op.create_index("ix_user_nickname", ["nickname"], unique=True)


def downgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("user", conn) and migration.column_exists("user", "nickname", conn):
        inspector = sa.inspect(conn)  # type: ignore[arg-type]
        index_names = {index.get("name") for index in inspector.get_indexes("user")}
        with op.batch_alter_table("user", schema=None) as batch_op:
            if "ix_user_nickname" in index_names:
                batch_op.drop_index("ix_user_nickname")
            batch_op.drop_column("nickname")
