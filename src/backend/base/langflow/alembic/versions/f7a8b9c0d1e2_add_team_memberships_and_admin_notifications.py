"""Add team memberships and admin notifications

Revision ID: f7a8b9c0d1e2
Revises: a4c1b2d3e4f5
Create Date: 2026-03-15 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import uuid4

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "f7a8b9c0d1e2"
down_revision: str | Sequence[str] | None = "a4c1b2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _index_names(conn, table_name: str) -> set[str]:
    inspector = sa.inspect(conn)  # type: ignore[arg-type]
    return {index.get("name") for index in inspector.get_indexes(table_name)}


def _ensure_index(table_name: str, index_name: str, columns: list[str]) -> None:
    conn = op.get_bind()
    if migration.table_exists(table_name, conn) and index_name not in _index_names(conn, table_name):
        op.create_index(index_name, table_name, columns, unique=False)


def upgrade() -> None:
    conn = op.get_bind()

    team_role_enum_create = sa.Enum("OWNER", "ADMIN", "MEMBER", name="team_role_enum")
    admin_target_type_enum_create = sa.Enum("ALL", "USERS", "TEAMS", name="admin_notification_target_type_enum")
    try:
        team_role_enum_create.create(conn, checkfirst=True)
        admin_target_type_enum_create.create(conn, checkfirst=True)
    except Exception:
        pass

    if conn.dialect.name == "postgresql":
        team_role_enum = postgresql.ENUM(
            "OWNER",
            "ADMIN",
            "MEMBER",
            name="team_role_enum",
            create_type=False,
        )
        admin_target_type_enum = postgresql.ENUM(
            "ALL",
            "USERS",
            "TEAMS",
            name="admin_notification_target_type_enum",
            create_type=False,
        )
    else:
        team_role_enum = sa.Enum("OWNER", "ADMIN", "MEMBER", name="team_role_enum")
        admin_target_type_enum = sa.Enum("ALL", "USERS", "TEAMS", name="admin_notification_target_type_enum")

    if not migration.table_exists("team_membership", conn):
        op.create_table(
            "team_membership",
            sa.Column("folder_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("user_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("role", team_role_enum, nullable=False, server_default=sa.text("'MEMBER'")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["folder_id"], ["folder.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("folder_id", "user_id", name="uq_team_membership_folder_user"),
        )

    _ensure_index("team_membership", "ix_team_membership_folder_id", ["folder_id"])
    _ensure_index("team_membership", "ix_team_membership_user_id", ["user_id"])
    _ensure_index("team_membership", "ix_team_membership_created_at", ["created_at"])

    if not migration.table_exists("admin_notification", conn):
        op.create_table(
            "admin_notification",
            sa.Column("title", sa.String(length=120), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("link", sa.String(length=500), nullable=True),
            sa.Column("created_by_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("target_type", admin_target_type_enum, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["created_by_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    _ensure_index("admin_notification", "ix_admin_notification_title", ["title"])
    _ensure_index("admin_notification", "ix_admin_notification_created_by_id", ["created_by_id"])
    _ensure_index("admin_notification", "ix_admin_notification_created_at", ["created_at"])
    _ensure_index("admin_notification", "ix_admin_notification_expires_at", ["expires_at"])

    if not migration.table_exists("admin_notification_user_target", conn):
        op.create_table(
            "admin_notification_user_target",
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("notification_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("user_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["notification_id"], ["admin_notification.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("notification_id", "user_id", name="uq_admin_notification_user_target"),
        )

    _ensure_index(
        "admin_notification_user_target",
        "ix_admin_notification_user_target_notification_id",
        ["notification_id"],
    )
    _ensure_index("admin_notification_user_target", "ix_admin_notification_user_target_user_id", ["user_id"])

    if not migration.table_exists("admin_notification_team_target", conn):
        op.create_table(
            "admin_notification_team_target",
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("notification_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("folder_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["notification_id"], ["admin_notification.id"]),
            sa.ForeignKeyConstraint(["folder_id"], ["folder.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("notification_id", "folder_id", name="uq_admin_notification_team_target"),
        )

    _ensure_index(
        "admin_notification_team_target",
        "ix_admin_notification_team_target_notification_id",
        ["notification_id"],
    )
    _ensure_index("admin_notification_team_target", "ix_admin_notification_team_target_folder_id", ["folder_id"])

    if not migration.table_exists("admin_notification_recipient", conn):
        op.create_table(
            "admin_notification_recipient",
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("notification_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("user_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["notification_id"], ["admin_notification.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("notification_id", "user_id", name="uq_admin_notification_recipient"),
        )

    _ensure_index("admin_notification_recipient", "ix_admin_notification_recipient_notification_id", ["notification_id"])
    _ensure_index("admin_notification_recipient", "ix_admin_notification_recipient_user_id", ["user_id"])
    _ensure_index("admin_notification_recipient", "ix_admin_notification_recipient_created_at", ["created_at"])
    _ensure_index("admin_notification_recipient", "ix_admin_notification_recipient_read_at", ["read_at"])
    _ensure_index("admin_notification_recipient", "ix_admin_notification_recipient_hidden_at", ["hidden_at"])

    if migration.table_exists("folder", conn) and migration.table_exists("team_membership", conn):
        rows = conn.execute(sa.text('SELECT id, user_id FROM folder WHERE user_id IS NOT NULL')).mappings().all()
        existing_pairs = {
            (row["folder_id"], row["user_id"])
            for row in conn.execute(sa.text("SELECT folder_id, user_id FROM team_membership")).mappings().all()
        }
        now = datetime.now(timezone.utc)
        memberships_to_insert = [
            {
                "id": uuid4(),
                "folder_id": row["id"],
                "user_id": row["user_id"],
                "role": "OWNER",
                "created_at": now,
            }
            for row in rows
            if (row["id"], row["user_id"]) not in existing_pairs
        ]
        if memberships_to_insert:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO team_membership (id, folder_id, user_id, role, created_at)
                    VALUES (:id, :folder_id, :user_id, :role, :created_at)
                    """
                ),
                memberships_to_insert,
            )


def downgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("admin_notification_recipient", conn):
        for index_name in [
            "ix_admin_notification_recipient_hidden_at",
            "ix_admin_notification_recipient_read_at",
            "ix_admin_notification_recipient_created_at",
            "ix_admin_notification_recipient_user_id",
            "ix_admin_notification_recipient_notification_id",
        ]:
            if index_name in _index_names(conn, "admin_notification_recipient"):
                op.drop_index(index_name, table_name="admin_notification_recipient")
        op.drop_table("admin_notification_recipient")

    if migration.table_exists("admin_notification_team_target", conn):
        for index_name in [
            "ix_admin_notification_team_target_folder_id",
            "ix_admin_notification_team_target_notification_id",
        ]:
            if index_name in _index_names(conn, "admin_notification_team_target"):
                op.drop_index(index_name, table_name="admin_notification_team_target")
        op.drop_table("admin_notification_team_target")

    if migration.table_exists("admin_notification_user_target", conn):
        for index_name in [
            "ix_admin_notification_user_target_user_id",
            "ix_admin_notification_user_target_notification_id",
        ]:
            if index_name in _index_names(conn, "admin_notification_user_target"):
                op.drop_index(index_name, table_name="admin_notification_user_target")
        op.drop_table("admin_notification_user_target")

    if migration.table_exists("admin_notification", conn):
        for index_name in [
            "ix_admin_notification_expires_at",
            "ix_admin_notification_created_at",
            "ix_admin_notification_created_by_id",
            "ix_admin_notification_title",
        ]:
            if index_name in _index_names(conn, "admin_notification"):
                op.drop_index(index_name, table_name="admin_notification")
        op.drop_table("admin_notification")

    if migration.table_exists("team_membership", conn):
        for index_name in [
            "ix_team_membership_created_at",
            "ix_team_membership_user_id",
            "ix_team_membership_folder_id",
        ]:
            if index_name in _index_names(conn, "team_membership"):
                op.drop_index(index_name, table_name="team_membership")
        op.drop_table("team_membership")

    team_role_enum = sa.Enum("OWNER", "ADMIN", "MEMBER", name="team_role_enum")
    admin_target_type_enum = sa.Enum("ALL", "USERS", "TEAMS", name="admin_notification_target_type_enum")
    try:
        team_role_enum.drop(conn, checkfirst=True)
        admin_target_type_enum.drop(conn, checkfirst=True)
    except Exception:
        pass
