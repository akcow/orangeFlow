from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import func, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from langflow.services.database.models.credit.model import (
    CreditAccount,
    CreditLedgerEntry,
    CreditLedgerEntryType,
    CreditPricingRule,
    CreditResourceType,
)
from langflow.services.database.models.user.model import User

DEFAULT_INITIAL_CREDITS = int(os.getenv("LANGFLOW_CREDITS_INITIAL_BALANCE", "100"))
DEFAULT_IMAGE_CREDITS_COST = int(os.getenv("LANGFLOW_CREDITS_DEFAULT_IMAGE_COST", "10"))
DEFAULT_VIDEO_CREDITS_COST = int(os.getenv("LANGFLOW_CREDITS_DEFAULT_VIDEO_COST", "30"))


@dataclass(slots=True)
class ChargeableBuildItem:
    vertex_id: str
    component_key: str
    resource_type: CreditResourceType
    model_key: str
    display_name: str
    credits_cost: int


@dataclass(slots=True)
class CreditBalanceCheck:
    account: CreditAccount
    items: list[ChargeableBuildItem]
    total_required: int


MODEL_NAME_ALIASES: dict[str, str] = {
    "doubao-seedance-1-5-pro-251215": "seedance 1.5 pro",
    "doubao-seedance-1.5-pro 251215": "seedance 1.5 pro",
    "doubao-seedance-1-0-pro-250528": "seedance 1.0 pro",
    "doubao-seedance-1.0-pro 250528": "seedance 1.0 pro",
    "kling-v3-omni": "kling o3",
    "kling-v3": "kling v3",
}

CHARGEABLE_COMPONENT_RESOURCE_TYPES: dict[str, CreditResourceType] = {
    "DoubaoImageCreator": CreditResourceType.IMAGE,
    "DoubaoVideoGenerator": CreditResourceType.VIDEO,
}

DEFAULT_PRICING_RULES: list[tuple[CreditResourceType, str, str, str, int]] = [
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "seedream 4.5", "Seedream 4.5", DEFAULT_IMAGE_CREDITS_COST),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "seedream 4.0", "Seedream 4.0", DEFAULT_IMAGE_CREDITS_COST),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "nano banana 2", "Nano Banana 2", DEFAULT_IMAGE_CREDITS_COST),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "nano banana pro", "Nano Banana Pro", DEFAULT_IMAGE_CREDITS_COST),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "wan2.6", "Wan 2.6", DEFAULT_IMAGE_CREDITS_COST),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "wan2.5", "Wan 2.5", DEFAULT_IMAGE_CREDITS_COST),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "kling o1", "Kling O1", DEFAULT_IMAGE_CREDITS_COST),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "kling o3", "Kling O3", DEFAULT_IMAGE_CREDITS_COST),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "kling v3", "Kling V3", DEFAULT_IMAGE_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "seedance 1.5 pro", "Seedance 1.5 Pro", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "seedance 1.0 pro", "Seedance 1.0 Pro", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "wan2.6", "Wan 2.6", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "wan2.5", "Wan 2.5", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "veo3.1", "Veo 3.1", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "veo3.1-fast", "Veo 3.1 Fast", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "sora-2", "Sora 2", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "sora-2-pro", "Sora 2 Pro", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "kling o1", "Kling O1", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "kling o3", "Kling O3", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "kling v3", "Kling V3", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "viduq2-pro", "Vidu Q2 Pro", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "viduq3-pro", "Vidu Q3 Pro", DEFAULT_VIDEO_CREDITS_COST),
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_model_name(raw_value: str | None) -> str:
    normalized = (
        str(raw_value or "")
        .lower()
        .replace("\uff08", "(")
        .replace("\uff09", ")")
        .replace("\u00b7", " ")
        .replace("|", " ")
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()
    normalized = re.sub(r"\([^)]*\)", "", normalized).strip()
    normalized = re.sub(r"\s+", " ", normalized).strip()

    if normalized.startswith("seedream 4.5"):
        normalized = "seedream 4.5"
    elif normalized.startswith("seedream 4.0"):
        normalized = "seedream 4.0"
    elif normalized.startswith("seedance 1.5 pro"):
        normalized = "seedance 1.5 pro"
    elif normalized.startswith("seedance 1.0 pro"):
        normalized = "seedance 1.0 pro"

    return MODEL_NAME_ALIASES.get(normalized, normalized)


def get_component_key_from_vertex_id(vertex_id: str) -> str:
    return str(vertex_id).split("-", maxsplit=1)[0]


def _extract_template_value(template: dict | None, field_name: str) -> str | None:
    if not isinstance(template, dict):
        return None
    field = template.get(field_name)
    if not isinstance(field, dict):
        return None
    value = field.get("value")
    if value:
        return str(value)
    default = field.get("default")
    if default:
        return str(default)
    options = field.get("options")
    if isinstance(options, list) and options:
        return str(options[0])
    return None


def extract_chargeable_component_data(
    node_payload: dict | None,
    *,
    fallback_vertex_id: str = "",
) -> tuple[str, str | None]:
    if not isinstance(node_payload, dict):
        component_key = get_component_key_from_vertex_id(fallback_vertex_id) if fallback_vertex_id else ""
        return component_key, None

    node_data = node_payload.get("data")
    if isinstance(node_data, dict):
        component_key = str(node_data.get("type") or get_component_key_from_vertex_id(fallback_vertex_id))
        template = None
        nested_node = node_data.get("node")
        if isinstance(nested_node, dict):
            template = nested_node.get("template")
        if template is None:
            template = node_data.get("template")
        return component_key, _extract_template_value(template, "model_name")

    component_key = str(node_payload.get("type") or get_component_key_from_vertex_id(fallback_vertex_id))
    template = node_payload.get("template")
    return component_key, _extract_template_value(template, "model_name")


async def ensure_default_pricing_rules(session: AsyncSession) -> None:
    existing = (await session.exec(select(CreditPricingRule.component_key, CreditPricingRule.model_key))).all()
    existing_pairs = {(component_key, model_key) for component_key, model_key in existing}

    missing_rules = [
        CreditPricingRule(
            resource_type=resource_type,
            component_key=component_key,
            model_key=model_key,
            display_name=display_name,
            credits_cost=credits_cost,
            is_active=True,
        )
        for resource_type, component_key, model_key, display_name, credits_cost in DEFAULT_PRICING_RULES
        if (component_key, model_key) not in existing_pairs
    ]
    if not missing_rules:
        return
    session.add_all(missing_rules)
    await session.commit()


async def get_pricing_rules(session: AsyncSession) -> list[CreditPricingRule]:
    await ensure_default_pricing_rules(session)
    return (
        await session.exec(
            select(CreditPricingRule).order_by(CreditPricingRule.resource_type, CreditPricingRule.display_name)
        )
    ).all()


async def get_or_create_credit_account(session: AsyncSession, user_id: UUID) -> CreditAccount:
    account = (await session.exec(select(CreditAccount).where(CreditAccount.user_id == user_id))).first()
    if account:
        return account

    account = CreditAccount(
        user_id=user_id,
        balance=DEFAULT_INITIAL_CREDITS,
        total_recharged=DEFAULT_INITIAL_CREDITS,
        total_consumed=0,
    )
    session.add(account)
    await session.flush()
    session.add(
        CreditLedgerEntry(
            account_id=account.id,
            user_id=user_id,
            delta=DEFAULT_INITIAL_CREDITS,
            balance_after=DEFAULT_INITIAL_CREDITS,
            entry_type=CreditLedgerEntryType.INITIAL_GRANT,
            remark="Initial credits",
        )
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        account = (await session.exec(select(CreditAccount).where(CreditAccount.user_id == user_id))).first()
        if account:
            return account
        raise
    await session.refresh(account)
    return account


async def list_credit_ledger(
    session: AsyncSession,
    *,
    user_id: UUID,
    limit: int = 50,
) -> list[CreditLedgerEntry]:
    await get_or_create_credit_account(session, user_id)
    return (
        await session.exec(
            select(CreditLedgerEntry)
            .where(CreditLedgerEntry.user_id == user_id)
            .order_by(CreditLedgerEntry.created_at.desc())
            .limit(limit)
        )
    ).all()


async def list_admin_credit_users(
    session: AsyncSession,
    *,
    skip: int = 0,
    limit: int = 20,
    search: str = "",
) -> tuple[int, list[tuple[User, CreditAccount]]]:
    users = (await session.exec(select(User))).all()
    for user in users:
        await get_or_create_credit_account(session, user.id)

    query = select(User, CreditAccount).join(CreditAccount, CreditAccount.user_id == User.id).order_by(User.create_at.desc())
    total_count_query = select(func.count()).select_from(User).join(CreditAccount, CreditAccount.user_id == User.id)
    normalized_search = search.strip().lower()
    if normalized_search:
        like_term = f"%{normalized_search}%"
        filter_condition = or_(
            func.lower(User.username).like(like_term),
            func.lower(User.nickname).like(like_term),
        )
        query = query.where(filter_condition)
        total_count_query = total_count_query.where(filter_condition)

    total_count = int((await session.exec(total_count_query)).one())
    rows = (await session.exec(query.offset(skip).limit(limit))).all()
    return total_count, rows


async def adjust_user_credits(
    session: AsyncSession,
    *,
    target_user_id: UUID,
    admin_user_id: UUID,
    amount: int,
    remark: str,
) -> CreditLedgerEntry:
    if amount == 0:
        raise HTTPException(status_code=400, detail="Adjustment amount cannot be 0")
    if not remark.strip():
        raise HTTPException(status_code=400, detail="Adjustment remark is required")

    account = await get_or_create_credit_account(session, target_user_id)
    next_balance = account.balance + amount
    if next_balance < 0:
        raise HTTPException(status_code=400, detail="Credit balance cannot go below 0")

    account.balance = next_balance
    if amount > 0:
        account.total_recharged += amount
    else:
        account.total_consumed += abs(amount)
    account.updated_at = utc_now()

    entry = CreditLedgerEntry(
        account_id=account.id,
        user_id=target_user_id,
        delta=amount,
        balance_after=next_balance,
        entry_type=CreditLedgerEntryType.MANUAL_ADJUSTMENT,
        remark=remark.strip(),
        created_by_id=admin_user_id,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


async def update_pricing_rule(
    session: AsyncSession,
    *,
    rule_id: UUID,
    credits_cost: int | None = None,
    is_active: bool | None = None,
    display_name: str | None = None,
) -> CreditPricingRule:
    rule = await session.get(CreditPricingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Pricing rule not found")
    if credits_cost is not None:
        if credits_cost < 0:
            raise HTTPException(status_code=400, detail="credits_cost cannot be negative")
        rule.credits_cost = credits_cost
    if is_active is not None:
        rule.is_active = is_active
    if display_name is not None and display_name.strip():
        rule.display_name = display_name.strip()
    rule.updated_at = utc_now()
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


async def resolve_pricing_rule(
    session: AsyncSession,
    *,
    component_key: str,
    model_key: str,
) -> CreditPricingRule | None:
    await ensure_default_pricing_rules(session)
    return (
        await session.exec(
            select(CreditPricingRule).where(
                CreditPricingRule.component_key == component_key,
                CreditPricingRule.model_key == model_key,
                CreditPricingRule.is_active == True,  # noqa: E712
            )
        )
    ).first()


def extract_chargeable_item_from_node(
    node_payload: dict | None,
    *,
    vertex_id: str = "",
) -> tuple[str, CreditResourceType | None, str | None]:
    component_key, raw_model_name = extract_chargeable_component_data(node_payload, fallback_vertex_id=vertex_id)
    resource_type = CHARGEABLE_COMPONENT_RESOURCE_TYPES.get(component_key)
    if not resource_type:
        return component_key, None, None
    model_key = normalize_model_name(raw_model_name)
    return component_key, resource_type, model_key or None


async def collect_chargeable_items_from_flow_data(
    session: AsyncSession,
    *,
    flow_data: dict | None,
    planned_vertex_ids: list[str] | None = None,
) -> list[ChargeableBuildItem]:
    nodes = flow_data.get("nodes", []) if isinstance(flow_data, dict) else []
    planned_vertex_ids_set = set(planned_vertex_ids or [])
    items: list[ChargeableBuildItem] = []

    for node in nodes:
        if not isinstance(node, dict):
            continue
        vertex_id = str(node.get("id") or "")
        if planned_vertex_ids_set and vertex_id not in planned_vertex_ids_set:
            continue
        component_key, resource_type, model_key = extract_chargeable_item_from_node(node, vertex_id=vertex_id)
        if not resource_type or not model_key:
            continue
        pricing_rule = await resolve_pricing_rule(session, component_key=component_key, model_key=model_key)
        if not pricing_rule:
            continue
        items.append(
            ChargeableBuildItem(
                vertex_id=vertex_id,
                component_key=component_key,
                resource_type=resource_type,
                model_key=model_key,
                display_name=pricing_rule.display_name,
                credits_cost=pricing_rule.credits_cost,
            )
        )
    return items


async def ensure_sufficient_balance_for_items(
    session: AsyncSession,
    *,
    user_id: UUID,
    items: list[ChargeableBuildItem],
) -> CreditBalanceCheck:
    account = await get_or_create_credit_account(session, user_id)
    total_required = sum(item.credits_cost for item in items)
    if total_required > account.balance:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "INSUFFICIENT_CREDITS",
                "message": "Insufficient credits",
                "current_balance": account.balance,
                "required_credits": total_required,
                "shortage": total_required - account.balance,
                "items": [
                    {
                        "vertex_id": item.vertex_id,
                        "component_key": item.component_key,
                        "model_key": item.model_key,
                        "credits_cost": item.credits_cost,
                    }
                    for item in items
                ],
            },
        )
    return CreditBalanceCheck(account=account, items=items, total_required=total_required)


async def apply_usage_charge(
    session: AsyncSession,
    *,
    user_id: UUID,
    flow_id: UUID,
    run_id: str,
    vertex_id: str,
    component_key: str,
    resource_type: CreditResourceType,
    model_key: str,
    credits_cost: int,
) -> CreditLedgerEntry | None:
    if credits_cost <= 0:
        return None

    dedupe_key = f"usage:{run_id}:{vertex_id}"
    existing_entry = (await session.exec(select(CreditLedgerEntry).where(CreditLedgerEntry.dedupe_key == dedupe_key))).first()
    if existing_entry:
        return existing_entry

    account = await get_or_create_credit_account(session, user_id)
    if account.balance < credits_cost:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CREDITS_CHARGE_CONFLICT",
                "message": "Credit balance changed before charge could be applied",
                "current_balance": account.balance,
                "required_credits": credits_cost,
            },
        )

    account.balance -= credits_cost
    account.total_consumed += credits_cost
    account.updated_at = utc_now()

    entry = CreditLedgerEntry(
        account_id=account.id,
        user_id=user_id,
        delta=-credits_cost,
        balance_after=account.balance,
        entry_type=CreditLedgerEntryType.USAGE_CHARGE,
        resource_type=resource_type,
        component_key=component_key,
        model_key=model_key,
        flow_id=flow_id,
        run_id=run_id,
        vertex_id=vertex_id,
        dedupe_key=dedupe_key,
        remark=f"{component_key}:{model_key}",
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry
