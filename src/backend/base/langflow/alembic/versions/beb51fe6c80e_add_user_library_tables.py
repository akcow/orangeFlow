"""Add user asset/workflow library tables and merge heads

Revision ID: beb51fe6c80e
Revises: 9d3c6b2f1a10, d9a6ea21edcd
Create Date: 2026-02-07 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "beb51fe6c80e"
down_revision: tuple[str, str] | None = ("9d3c6b2f1a10", "d9a6ea21edcd")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    if not migration.table_exists("user_asset", conn):
        op.create_table(
            "user_asset",
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("user_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("category", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("tags", sa.JSON(), nullable=False),
            sa.Column("cover", sa.JSON(), nullable=False),
            sa.Column("data", sa.JSON(), nullable=False),
            sa.Column("resource_map", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"], name="fk_user_asset_user_id_user"),
        )
        op.create_index("ix_user_asset_user_id", "user_asset", ["user_id"], unique=False)
        op.create_index("ix_user_asset_name", "user_asset", ["name"], unique=False)

    if not migration.table_exists("user_workflow", conn):
        op.create_table(
            "user_workflow",
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("user_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("tags", sa.JSON(), nullable=False),
            sa.Column("cover", sa.JSON(), nullable=False),
            sa.Column("selection", sa.JSON(), nullable=False),
            sa.Column("resource_map", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"], name="fk_user_workflow_user_id_user"),
        )
        op.create_index("ix_user_workflow_user_id", "user_workflow", ["user_id"], unique=False)
        op.create_index("ix_user_workflow_name", "user_workflow", ["name"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("user_workflow", conn):
        op.drop_index("ix_user_workflow_name", table_name="user_workflow")
        op.drop_index("ix_user_workflow_user_id", table_name="user_workflow")
        op.drop_table("user_workflow")

    if migration.table_exists("user_asset", conn):
        op.drop_index("ix_user_asset_name", table_name="user_asset")
        op.drop_index("ix_user_asset_user_id", table_name="user_asset")
        op.drop_table("user_asset")

