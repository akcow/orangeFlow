from __future__ import annotations

from enum import Enum
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.services.credits.service import (
    adjust_user_credits,
    estimate_chargeable_build_item,
    get_or_create_credit_account,
    get_pricing_rules,
    list_admin_credit_users,
    list_credit_ledger,
    update_pricing_rule,
)
from langflow.services.database.models.credit.model import (
    CreditLedgerEntryType,
    CreditPricingRule,
    CreditResourceType,
)

router = APIRouter(prefix="/credits", tags=["Credits"])


class CreditAccountResponse(BaseModel):
    user_id: UUID
    balance: int
    total_recharged: int
    total_consumed: int
    created_at: str
    updated_at: str


class CreditLedgerEntryResponse(BaseModel):
    id: UUID
    delta: int
    balance_after: int
    entry_type: CreditLedgerEntryType
    resource_type: CreditResourceType | None = None
    component_key: str | None = None
    model_key: str | None = None
    flow_id: UUID | None = None
    run_id: str | None = None
    vertex_id: str | None = None
    remark: str | None = None
    created_by_id: UUID | None = None
    created_at: str


class CreditPricingRuleResponse(BaseModel):
    id: UUID
    resource_type: CreditResourceType
    component_key: str
    model_key: str
    display_name: str
    credits_cost: int
    is_active: bool
    created_at: str
    updated_at: str


class CreditAdminUserResponse(BaseModel):
    id: UUID
    username: str
    nickname: str
    is_active: bool
    is_superuser: bool
    is_reviewer: bool
    profile_image: str | None = None
    credit_balance: int
    credit_total_recharged: int
    credit_total_consumed: int
    created_at: str
    updated_at: str
    last_login_at: str | None = None


class CreditAdminUsersPageResponse(BaseModel):
    total_count: int
    users: list[CreditAdminUserResponse]


class CreditAdjustmentRequest(BaseModel):
    amount: int = Field(description="Positive adds credits, negative subtracts credits")
    remark: str = Field(min_length=1, max_length=500)


class CreditPricingRuleUpdateRequest(BaseModel):
    credits_cost: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    display_name: str | None = Field(default=None, max_length=120)


class CreditEstimateBillingMode(str, Enum):
    ESTIMATED = "estimated"
    USAGE_BASED = "usage_based"
    UNAVAILABLE = "unavailable"


class CreditEstimateRequest(BaseModel):
    node_payload: dict[str, Any] | None = None
    vertex_id: str = ""


class CreditEstimateResponse(BaseModel):
    component_key: str
    resource_type: CreditResourceType | None = None
    model_key: str | None = None
    display_name: str | None = None
    billing_mode: CreditEstimateBillingMode
    estimated_credits: int | None = None


def _to_account_response(account) -> CreditAccountResponse:
    return CreditAccountResponse(
        user_id=account.user_id,
        balance=account.balance,
        total_recharged=account.total_recharged,
        total_consumed=account.total_consumed,
        created_at=account.created_at.replace(microsecond=0).isoformat(),
        updated_at=account.updated_at.replace(microsecond=0).isoformat(),
    )


def _to_ledger_response(entry) -> CreditLedgerEntryResponse:
    return CreditLedgerEntryResponse(
        id=entry.id,
        delta=entry.delta,
        balance_after=entry.balance_after,
        entry_type=entry.entry_type,
        resource_type=entry.resource_type,
        component_key=entry.component_key,
        model_key=entry.model_key,
        flow_id=entry.flow_id,
        run_id=entry.run_id,
        vertex_id=entry.vertex_id,
        remark=entry.remark,
        created_by_id=entry.created_by_id,
        created_at=entry.created_at.replace(microsecond=0).isoformat(),
    )


def _to_pricing_response(rule: CreditPricingRule) -> CreditPricingRuleResponse:
    return CreditPricingRuleResponse(
        id=rule.id,
        resource_type=rule.resource_type,
        component_key=rule.component_key,
        model_key=rule.model_key,
        display_name=rule.display_name,
        credits_cost=rule.credits_cost,
        is_active=rule.is_active,
        created_at=rule.created_at.replace(microsecond=0).isoformat(),
        updated_at=rule.updated_at.replace(microsecond=0).isoformat(),
    )


def _to_estimate_response(estimate) -> CreditEstimateResponse:
    return CreditEstimateResponse(
        component_key=estimate.component_key,
        resource_type=estimate.resource_type,
        model_key=estimate.model_key,
        display_name=estimate.display_name,
        billing_mode=CreditEstimateBillingMode(estimate.billing_mode),
        estimated_credits=estimate.estimated_credits,
    )


@router.get("/me", response_model=CreditAccountResponse, status_code=200)
async def get_my_credits(session: DbSession, current_user: CurrentActiveUser):
    account = await get_or_create_credit_account(session, current_user.id)
    return _to_account_response(account)


@router.get("/me/ledger", response_model=list[CreditLedgerEntryResponse], status_code=200)
async def get_my_credit_ledger(
    session: DbSession,
    current_user: CurrentActiveUser,
    limit: int = 50,
):
    entries = await list_credit_ledger(session, user_id=current_user.id, limit=max(1, min(limit, 200)))
    return [_to_ledger_response(entry) for entry in entries]


@router.get("/pricing", response_model=list[CreditPricingRuleResponse], status_code=200)
async def get_credit_pricing(session: DbSession, current_user: CurrentActiveUser):  # noqa: ARG001
    rules = await get_pricing_rules(session)
    return [_to_pricing_response(rule) for rule in rules]


@router.post("/estimate", response_model=CreditEstimateResponse, status_code=200)
async def post_credit_estimate(
    payload: CreditEstimateRequest,
    session: DbSession,
    current_user: CurrentActiveUser,  # noqa: ARG001
):
    estimate = await estimate_chargeable_build_item(
        session,
        node_payload=payload.node_payload,
        vertex_id=payload.vertex_id,
    )
    return _to_estimate_response(estimate)


@router.get("/admin/users", response_model=CreditAdminUsersPageResponse, status_code=200)
async def get_admin_credit_users(
    session: DbSession,
    current_user: CurrentActiveUser,
    skip: int = 0,
    limit: int = 20,
    search: str = "",
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser only")
    total_count, rows = await list_admin_credit_users(
        session,
        skip=max(skip, 0),
        limit=max(1, min(limit, 200)),
        search=search,
    )
    return CreditAdminUsersPageResponse(
        total_count=total_count,
        users=[
            CreditAdminUserResponse(
                id=user.id,
                username=user.username,
                nickname=user.nickname,
                is_active=user.is_active,
                is_superuser=user.is_superuser,
                is_reviewer=user.is_reviewer,
                profile_image=user.profile_image,
                credit_balance=account.balance,
                credit_total_recharged=account.total_recharged,
                credit_total_consumed=account.total_consumed,
                created_at=user.create_at.replace(microsecond=0).isoformat(),
                updated_at=user.updated_at.replace(microsecond=0).isoformat(),
                last_login_at=user.last_login_at.replace(microsecond=0).isoformat() if user.last_login_at else None,
            )
            for user, account in rows
        ],
    )


@router.get("/admin/users/{user_id}/ledger", response_model=list[CreditLedgerEntryResponse], status_code=200)
async def get_admin_user_credit_ledger(
    user_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
    limit: int = 50,
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser only")
    entries = await list_credit_ledger(session, user_id=user_id, limit=max(1, min(limit, 200)))
    return [_to_ledger_response(entry) for entry in entries]


@router.post("/admin/users/{user_id}/adjust", response_model=CreditLedgerEntryResponse, status_code=200)
async def post_admin_adjust_user_credits(
    user_id: UUID,
    payload: CreditAdjustmentRequest,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser only")
    entry = await adjust_user_credits(
        session,
        target_user_id=user_id,
        admin_user_id=current_user.id,
        amount=payload.amount,
        remark=payload.remark,
    )
    return _to_ledger_response(entry)


@router.patch("/admin/pricing/{rule_id}", response_model=CreditPricingRuleResponse, status_code=200)
async def patch_admin_pricing_rule(
    rule_id: UUID,
    payload: CreditPricingRuleUpdateRequest,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser only")
    rule = await update_pricing_rule(
        session,
        rule_id=rule_id,
        credits_cost=payload.credits_cost,
        is_active=payload.is_active,
        display_name=payload.display_name,
    )
    return _to_pricing_response(rule)
