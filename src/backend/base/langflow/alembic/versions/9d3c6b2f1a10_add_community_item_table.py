"""Add community_item table

Revision ID: 9d3c6b2f1a10
Revises: 182e5471b900
Create Date: 2026-02-04 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "9d3c6b2f1a10"
down_revision: str | None = "182e5471b900"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)  # type: ignore
    table_names = inspector.get_table_names()

    # Create enums if needed (mostly relevant for Postgres; SQLite ignores these).
    community_item_type_enum_create = sa.Enum("TV", "WORKFLOW", name="community_item_type_enum")
    community_item_status_enum_create = sa.Enum("PRIVATE", "PUBLIC", "UNREVIEWED", name="community_item_status_enum")
    try:
        community_item_type_enum_create.create(conn, checkfirst=True)
        community_item_status_enum_create.create(conn, checkfirst=True)
    except Exception:
        # Best effort: some dialects don't support CREATE TYPE the same way.
        pass
    community_item_type_enum = postgresql.ENUM("TV", "WORKFLOW", name="community_item_type_enum", create_type=False)
    community_item_status_enum = postgresql.ENUM(
        "PRIVATE",
        "PUBLIC",
        "UNREVIEWED",
        name="community_item_status_enum",
        create_type=False,
    )

    if "community_item" not in table_names:
        op.create_table(
            "community_item",
            sa.Column("type", community_item_type_enum, nullable=False),
            sa.Column(
                "status",
                community_item_status_enum,
                nullable=False,
                server_default=sa.text("'UNREVIEWED'"),
            ),
            sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("flow_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("user_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("cover_path", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column("media_path", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column("public_canvas", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["flow_id"], ["flow.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    # Indexes (guarded)
    idx = inspector.get_indexes("community_item") if "community_item" in inspector.get_table_names() else []
    idx_names = {i.get("name") for i in idx}
    with op.batch_alter_table("community_item", schema=None) as batch_op:
        if "ix_community_item_title" not in idx_names:
            batch_op.create_index("ix_community_item_title", ["title"], unique=False)
        if "ix_community_item_flow_id" not in idx_names:
            batch_op.create_index("ix_community_item_flow_id", ["flow_id"], unique=False)
        if "ix_community_item_user_id" not in idx_names:
            batch_op.create_index("ix_community_item_user_id", ["user_id"], unique=False)
        if "ix_community_item_created_at" not in idx_names:
            batch_op.create_index("ix_community_item_created_at", ["created_at"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)  # type: ignore
    table_names = inspector.get_table_names()

    if "community_item" in table_names:
        op.drop_table("community_item")

    # Drop enums (best effort)
    community_item_type_enum = sa.Enum("TV", "WORKFLOW", name="community_item_type_enum")
    community_item_status_enum = sa.Enum("PRIVATE", "PUBLIC", "UNREVIEWED", name="community_item_status_enum")
    try:
        community_item_status_enum.drop(conn, checkfirst=True)
        community_item_type_enum.drop(conn, checkfirst=True)
    except Exception:
        pass
