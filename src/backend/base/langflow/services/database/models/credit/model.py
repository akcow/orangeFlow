from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import UUID, uuid4

from pydantic import field_serializer
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import Column, UniqueConstraint, text
from sqlmodel import Field, SQLModel


class CreditResourceType(str, Enum):
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"


class CreditLedgerEntryType(str, Enum):
    INITIAL_GRANT = "INITIAL_GRANT"
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"
    USAGE_CHARGE = "USAGE_CHARGE"


def _serialize_datetime(value: datetime) -> str:
    value = value.replace(microsecond=0)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


class CreditAccountBase(SQLModel):
    user_id: UUID = Field(foreign_key="user.id", index=True)
    balance: int = Field(default=0, nullable=False)
    total_recharged: int = Field(default=0, nullable=False)
    total_consumed: int = Field(default=0, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)

    @field_serializer("created_at", "updated_at")
    def _serialize_datetime_fields(self, value: datetime) -> str:
        return _serialize_datetime(value)


class CreditAccount(CreditAccountBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "credit_account"
    __table_args__ = (UniqueConstraint("user_id", name="uq_credit_account_user"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)


class CreditAccountRead(CreditAccountBase):
    id: UUID


class CreditPricingRuleBase(SQLModel):
    resource_type: CreditResourceType = Field(
        sa_column=Column(
            SQLEnum(
                CreditResourceType,
                name="credit_resource_type_enum",
                values_callable=lambda enum: [member.value for member in enum],
            ),
            nullable=False,
        ),
    )
    component_key: str = Field(index=True, max_length=120)
    model_key: str = Field(index=True, max_length=120)
    display_name: str = Field(max_length=120)
    credits_cost: int = Field(default=0, nullable=False)
    is_active: bool = Field(default=True, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)

    @field_serializer("created_at", "updated_at")
    def _serialize_datetime_fields(self, value: datetime) -> str:
        return _serialize_datetime(value)


class CreditPricingRule(CreditPricingRuleBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "credit_pricing_rule"
    __table_args__ = (UniqueConstraint("component_key", "model_key", name="uq_credit_pricing_component_model"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)


class CreditPricingRuleRead(CreditPricingRuleBase):
    id: UUID


class CreditLedgerEntryBase(SQLModel):
    account_id: UUID = Field(foreign_key="credit_account.id", index=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    delta: int = Field(nullable=False)
    balance_after: int = Field(nullable=False)
    entry_type: CreditLedgerEntryType = Field(
        sa_column=Column(
            SQLEnum(
                CreditLedgerEntryType,
                name="credit_ledger_entry_type_enum",
                values_callable=lambda enum: [member.value for member in enum],
            ),
            nullable=False,
        ),
    )
    resource_type: CreditResourceType | None = Field(
        default=None,
        sa_column=Column(
            SQLEnum(
                CreditResourceType,
                name="credit_resource_type_enum",
                values_callable=lambda enum: [member.value for member in enum],
            ),
            nullable=True,
        ),
    )
    component_key: str | None = Field(default=None, max_length=120, index=True)
    model_key: str | None = Field(default=None, max_length=120, index=True)
    flow_id: UUID | None = Field(default=None, foreign_key="flow.id", nullable=True, index=True)
    run_id: str | None = Field(default=None, max_length=120, nullable=True, index=True)
    vertex_id: str | None = Field(default=None, max_length=120, nullable=True, index=True)
    dedupe_key: str | None = Field(default=None, max_length=255, nullable=True)
    remark: str | None = Field(default=None, nullable=True)
    created_by_id: UUID | None = Field(default=None, foreign_key="user.id", nullable=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime) -> str:
        return _serialize_datetime(value)


class CreditLedgerEntry(CreditLedgerEntryBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "credit_ledger_entry"
    __table_args__ = (UniqueConstraint("dedupe_key", name="uq_credit_ledger_dedupe_key"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)


class CreditLedgerEntryRead(CreditLedgerEntryBase):
    id: UUID
