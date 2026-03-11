"""add user scope and indexes to history tables

Revision ID: 4c9e3b6d7f12
Revises: 0b8757876a7c, e3bc869fa272, f1c4d9a7b2e0
Create Date: 2026-03-10 16:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "4c9e3b6d7f12"
down_revision: str | Sequence[str] | None = ("0b8757876a7c", "e3bc869fa272", "f1c4d9a7b2e0")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _index_exists(conn, table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(conn)
    return index_name in [index["name"] for index in inspector.get_indexes(table_name)]


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    conn = op.get_bind()
    if not _index_exists(conn, table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=False)


def upgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("message", conn) and not migration.column_exists("message", "user_id", conn):
        op.add_column("message", sa.Column("user_id", sa.Uuid(), nullable=True))
    if migration.table_exists("vertex_build", conn) and not migration.column_exists("vertex_build", "user_id", conn):
        op.add_column("vertex_build", sa.Column("user_id", sa.Uuid(), nullable=True))

    if migration.table_exists("message", conn) and migration.column_exists("message", "user_id", conn):
        conn.execute(
            sa.text(
                """
                UPDATE message
                SET user_id = (
                    SELECT flow.user_id
                    FROM flow
                    WHERE flow.id = message.flow_id
                )
                WHERE user_id IS NULL AND flow_id IS NOT NULL
                """
            )
        )

    if migration.table_exists("vertex_build", conn) and migration.column_exists("vertex_build", "user_id", conn):
        conn.execute(
            sa.text(
                """
                UPDATE vertex_build
                SET user_id = (
                    SELECT flow.user_id
                    FROM flow
                    WHERE flow.id = vertex_build.flow_id
                )
                WHERE user_id IS NULL AND flow_id IS NOT NULL
                """
            )
        )

    if migration.table_exists("message", conn):
        _create_index_if_missing("ix_message_flow_id_timestamp", "message", ["flow_id", "timestamp"])
        _create_index_if_missing("ix_message_user_id_session_id_timestamp", "message", ["user_id", "session_id", "timestamp"])

    if migration.table_exists("vertex_build", conn):
        _create_index_if_missing("ix_vertex_build_flow_id_timestamp", "vertex_build", ["flow_id", "timestamp"])
        _create_index_if_missing("ix_vertex_build_user_id_flow_id_timestamp", "vertex_build", ["user_id", "flow_id", "timestamp"])


def downgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("vertex_build", conn):
        if _index_exists(conn, "vertex_build", "ix_vertex_build_user_id_flow_id_timestamp"):
            op.drop_index("ix_vertex_build_user_id_flow_id_timestamp", table_name="vertex_build")
        if _index_exists(conn, "vertex_build", "ix_vertex_build_flow_id_timestamp"):
            op.drop_index("ix_vertex_build_flow_id_timestamp", table_name="vertex_build")
        if migration.column_exists("vertex_build", "user_id", conn):
            op.drop_column("vertex_build", "user_id")

    if migration.table_exists("message", conn):
        if _index_exists(conn, "message", "ix_message_user_id_session_id_timestamp"):
            op.drop_index("ix_message_user_id_session_id_timestamp", table_name="message")
        if _index_exists(conn, "message", "ix_message_flow_id_timestamp"):
            op.drop_index("ix_message_flow_id_timestamp", table_name="message")
        if migration.column_exists("message", "user_id", conn):
            op.drop_column("message", "user_id")
