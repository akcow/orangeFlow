"""Remove legacy team invitation schema artifacts

Revision ID: f9b1c2d3e4f5
Revises: e6f7a8b9c0d1
Create Date: 2026-04-02 12:05:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "f9b1c2d3e4f5"
down_revision: str | Sequence[str] | None = "e6f7a8b9c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _drop_enum_if_exists(conn, enum_name: str) -> None:
    if conn.dialect.name == "postgresql":
        op.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name}"))


def upgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("team_invitation", conn):
        op.drop_table("team_invitation")

    if migration.table_exists("team_membership", conn) and migration.column_exists("team_membership", "credit_limit", conn):
        with op.batch_alter_table("team_membership", schema=None) as batch_op:
            batch_op.drop_column("credit_limit")

    _drop_enum_if_exists(conn, "team_invitation_status_enum")


def downgrade() -> None:
    conn = op.get_bind()

    invitation_status_enum = sa.Enum(
        "PENDING",
        "ACCEPTED",
        "REJECTED",
        "CANCELLED",
        name="team_invitation_status_enum",
    )
    try:
        invitation_status_enum.create(conn, checkfirst=True)
    except Exception:
        pass

    if migration.table_exists("team_membership", conn) and not migration.column_exists("team_membership", "credit_limit", conn):
        with op.batch_alter_table("team_membership", schema=None) as batch_op:
            batch_op.add_column(sa.Column("credit_limit", sa.Integer(), nullable=True))

    if not migration.table_exists("team_invitation", conn):
        op.create_table(
            "team_invitation",
            sa.Column("folder_id", sa.Uuid(), nullable=False),
            sa.Column("invited_user_id", sa.Uuid(), nullable=False),
            sa.Column("invited_by_id", sa.Uuid(), nullable=False),
            sa.Column("invite_role", sa.String(length=20), nullable=False, server_default=sa.text("'MEMBER'")),
            sa.Column("message", sa.Text(), nullable=True),
            sa.Column("status", invitation_status_enum, nullable=False, server_default=sa.text("'PENDING'")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["folder_id"], ["folder.id"]),
            sa.ForeignKeyConstraint(["invited_by_id"], ["user.id"]),
            sa.ForeignKeyConstraint(["invited_user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_team_invitation_folder_id", "team_invitation", ["folder_id"], unique=False)
        op.create_index("ix_team_invitation_invited_user_id", "team_invitation", ["invited_user_id"], unique=False)
        op.create_index("ix_team_invitation_invited_by_id", "team_invitation", ["invited_by_id"], unique=False)
        op.create_index("ix_team_invitation_created_at", "team_invitation", ["created_at"], unique=False)
        op.create_index("ix_team_invitation_responded_at", "team_invitation", ["responded_at"], unique=False)
        op.create_index("ix_team_invitation_expires_at", "team_invitation", ["expires_at"], unique=False)
