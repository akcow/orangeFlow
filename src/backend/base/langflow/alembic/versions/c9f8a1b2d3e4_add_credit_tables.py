"""Add credit tables

Revision ID: c9f8a1b2d3e4
Revises: f7a8b9c0d1e2
Create Date: 2026-03-15 00:10:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

from langflow.utils import migration

# revision identifiers, used by Alembic.
revision: str = "c9f8a1b2d3e4"
down_revision: str | Sequence[str] | None = "f7a8b9c0d1e2"
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

    resource_type_enum_create = sa.Enum("IMAGE", "VIDEO", name="credit_resource_type_enum")
    ledger_entry_type_enum_create = sa.Enum(
        "INITIAL_GRANT",
        "MANUAL_ADJUSTMENT",
        "USAGE_CHARGE",
        name="credit_ledger_entry_type_enum",
    )
    try:
        resource_type_enum_create.create(conn, checkfirst=True)
        ledger_entry_type_enum_create.create(conn, checkfirst=True)
    except Exception:
        pass

    if conn.dialect.name == "postgresql":
        resource_type_enum = postgresql.ENUM(
            "IMAGE",
            "VIDEO",
            name="credit_resource_type_enum",
            create_type=False,
        )
        ledger_entry_type_enum = postgresql.ENUM(
            "INITIAL_GRANT",
            "MANUAL_ADJUSTMENT",
            "USAGE_CHARGE",
            name="credit_ledger_entry_type_enum",
            create_type=False,
        )
    else:
        resource_type_enum = sa.Enum("IMAGE", "VIDEO", name="credit_resource_type_enum")
        ledger_entry_type_enum = sa.Enum(
            "INITIAL_GRANT",
            "MANUAL_ADJUSTMENT",
            "USAGE_CHARGE",
            name="credit_ledger_entry_type_enum",
        )

    if not migration.table_exists("credit_account", conn):
        op.create_table(
            "credit_account",
            sa.Column("user_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("balance", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_recharged", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_consumed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", name="uq_credit_account_user"),
        )

    _ensure_index("credit_account", "ix_credit_account_user_id", ["user_id"])
    _ensure_index("credit_account", "ix_credit_account_created_at", ["created_at"])
    _ensure_index("credit_account", "ix_credit_account_updated_at", ["updated_at"])

    if not migration.table_exists("credit_pricing_rule", conn):
        op.create_table(
            "credit_pricing_rule",
            sa.Column("resource_type", resource_type_enum, nullable=False),
            sa.Column("component_key", sa.String(length=120), nullable=False),
            sa.Column("model_key", sa.String(length=120), nullable=False),
            sa.Column("display_name", sa.String(length=120), nullable=False),
            sa.Column("credits_cost", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("component_key", "model_key", name="uq_credit_pricing_component_model"),
        )

    _ensure_index("credit_pricing_rule", "ix_credit_pricing_rule_component_key", ["component_key"])
    _ensure_index("credit_pricing_rule", "ix_credit_pricing_rule_model_key", ["model_key"])
    _ensure_index("credit_pricing_rule", "ix_credit_pricing_rule_created_at", ["created_at"])
    _ensure_index("credit_pricing_rule", "ix_credit_pricing_rule_updated_at", ["updated_at"])

    if not migration.table_exists("credit_ledger_entry", conn):
        op.create_table(
            "credit_ledger_entry",
            sa.Column("account_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("user_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.Column("delta", sa.Integer(), nullable=False),
            sa.Column("balance_after", sa.Integer(), nullable=False),
            sa.Column("entry_type", ledger_entry_type_enum, nullable=False),
            sa.Column("resource_type", resource_type_enum, nullable=True),
            sa.Column("component_key", sa.String(length=120), nullable=True),
            sa.Column("model_key", sa.String(length=120), nullable=True),
            sa.Column("flow_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=True),
            sa.Column("run_id", sa.String(length=120), nullable=True),
            sa.Column("vertex_id", sa.String(length=120), nullable=True),
            sa.Column("dedupe_key", sa.String(length=255), nullable=True),
            sa.Column("remark", sa.Text(), nullable=True),
            sa.Column("created_by_id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("id", sqlmodel.sql.sqltypes.types.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["account_id"], ["credit_account.id"]),
            sa.ForeignKeyConstraint(["created_by_id"], ["user.id"]),
            sa.ForeignKeyConstraint(["flow_id"], ["flow.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("dedupe_key", name="uq_credit_ledger_dedupe_key"),
        )

    _ensure_index("credit_ledger_entry", "ix_credit_ledger_entry_account_id", ["account_id"])
    _ensure_index("credit_ledger_entry", "ix_credit_ledger_entry_user_id", ["user_id"])
    _ensure_index("credit_ledger_entry", "ix_credit_ledger_entry_component_key", ["component_key"])
    _ensure_index("credit_ledger_entry", "ix_credit_ledger_entry_model_key", ["model_key"])
    _ensure_index("credit_ledger_entry", "ix_credit_ledger_entry_flow_id", ["flow_id"])
    _ensure_index("credit_ledger_entry", "ix_credit_ledger_entry_run_id", ["run_id"])
    _ensure_index("credit_ledger_entry", "ix_credit_ledger_entry_vertex_id", ["vertex_id"])
    _ensure_index("credit_ledger_entry", "ix_credit_ledger_entry_created_by_id", ["created_by_id"])
    _ensure_index("credit_ledger_entry", "ix_credit_ledger_entry_created_at", ["created_at"])


def downgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("credit_ledger_entry", conn):
        for index_name in [
            "ix_credit_ledger_entry_created_at",
            "ix_credit_ledger_entry_created_by_id",
            "ix_credit_ledger_entry_vertex_id",
            "ix_credit_ledger_entry_run_id",
            "ix_credit_ledger_entry_flow_id",
            "ix_credit_ledger_entry_model_key",
            "ix_credit_ledger_entry_component_key",
            "ix_credit_ledger_entry_user_id",
            "ix_credit_ledger_entry_account_id",
        ]:
            if index_name in _index_names(conn, "credit_ledger_entry"):
                op.drop_index(index_name, table_name="credit_ledger_entry")
        op.drop_table("credit_ledger_entry")

    if migration.table_exists("credit_pricing_rule", conn):
        for index_name in [
            "ix_credit_pricing_rule_updated_at",
            "ix_credit_pricing_rule_created_at",
            "ix_credit_pricing_rule_model_key",
            "ix_credit_pricing_rule_component_key",
        ]:
            if index_name in _index_names(conn, "credit_pricing_rule"):
                op.drop_index(index_name, table_name="credit_pricing_rule")
        op.drop_table("credit_pricing_rule")

    if migration.table_exists("credit_account", conn):
        for index_name in [
            "ix_credit_account_updated_at",
            "ix_credit_account_created_at",
            "ix_credit_account_user_id",
        ]:
            if index_name in _index_names(conn, "credit_account"):
                op.drop_index(index_name, table_name="credit_account")
        op.drop_table("credit_account")

    resource_type_enum = sa.Enum("IMAGE", "VIDEO", name="credit_resource_type_enum")
    ledger_entry_type_enum = sa.Enum(
        "INITIAL_GRANT",
        "MANUAL_ADJUSTMENT",
        "USAGE_CHARGE",
        name="credit_ledger_entry_type_enum",
    )
    try:
        ledger_entry_type_enum.drop(conn, checkfirst=True)
        resource_type_enum.drop(conn, checkfirst=True)
    except Exception:
        pass
