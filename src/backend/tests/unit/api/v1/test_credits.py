from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import AsyncClient

from langflow.services.credits.service import (
    ChargeableBuildItem,
    adjust_user_credits,
    apply_usage_charge,
    calculate_formula_credits_cost,
    ensure_sufficient_balance_for_items,
    get_or_create_credit_account,
    get_pricing_rules,
    normalize_model_name,
)
from langflow.services.database.models.credit.model import CreditPricingRule, CreditResourceType
from langflow.services.database.models.flow.model import Flow
from langflow.services.database.models.user.model import User
from langflow.services.deps import get_db_service
from langflow.services.database.utils import session_getter


@pytest.mark.asyncio
async def test_get_my_credits_creates_account(client: AsyncClient, logged_in_headers: dict[str, str]):
    response = await client.get("api/v1/credits/me", headers=logged_in_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["balance"] == 100
    assert payload["total_recharged"] == 100
    assert payload["total_consumed"] == 0


@pytest.mark.asyncio
async def test_admin_can_adjust_user_credits(
    client: AsyncClient,
    logged_in_headers_super_user: dict[str, str],
    active_user,
):
    response = await client.post(
        f"api/v1/credits/admin/users/{active_user.id}/adjust",
        json={"amount": 25, "remark": "manual top-up"},
        headers=logged_in_headers_super_user,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["delta"] == 25
    assert payload["remark"] == "manual top-up"
    assert payload["balance_after"] == 125


@pytest.mark.asyncio
async def test_ensure_sufficient_balance_blocks_when_credits_are_too_low(async_session):
    user = User(
        username="credits-low@example.com",
        nickname="credits-low",
        password="hashed-password",
        is_active=True,
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)

    await get_or_create_credit_account(async_session, user.id)

    with pytest.raises(HTTPException) as exc_info:
        await ensure_sufficient_balance_for_items(
            async_session,
            user_id=user.id,
            items=[
                ChargeableBuildItem(
                    vertex_id="DoubaoVideoGenerator-1",
                    component_key="DoubaoVideoGenerator",
                    resource_type=CreditResourceType.VIDEO,
                    model_key="wan2.6",
                    display_name="Wan 2.6",
                    credits_cost=999,
                )
            ],
        )

    assert exc_info.value.status_code == 402
    assert exc_info.value.detail["code"] == "INSUFFICIENT_CREDITS"


@pytest.mark.asyncio
async def test_apply_usage_charge_is_idempotent(async_session):
    user = User(
        username="credits-charge@example.com",
        nickname="credits-charge",
        password="hashed-password",
        is_active=True,
    )
    flow = Flow(name=f"credits-flow-{uuid4()}", data={"nodes": [], "edges": []}, user_id=None)
    async_session.add(user)
    async_session.add(flow)
    await async_session.commit()
    await async_session.refresh(user)
    await async_session.refresh(flow)

    first_entry = await apply_usage_charge(
        async_session,
        user_id=user.id,
        flow_id=flow.id,
        run_id="run-1",
        vertex_id="DoubaoImageCreator-1",
        component_key="DoubaoImageCreator",
        resource_type=CreditResourceType.IMAGE,
        model_key="seedream 4.5",
        credits_cost=10,
    )
    second_entry = await apply_usage_charge(
        async_session,
        user_id=user.id,
        flow_id=flow.id,
        run_id="run-1",
        vertex_id="DoubaoImageCreator-1",
        component_key="DoubaoImageCreator",
        resource_type=CreditResourceType.IMAGE,
        model_key="seedream 4.5",
        credits_cost=10,
    )

    assert first_entry is not None
    assert second_entry is not None
    assert first_entry.id == second_entry.id

    account = await get_or_create_credit_account(async_session, user.id)
    assert account.balance == 90


def test_normalize_seedream_5_lite_aliases():
    assert normalize_model_name("doubao-seedream-5-0-260128") == "seedream 5.0 lite"
    assert normalize_model_name("doubao-seedream-5-0-lite-260128") == "seedream 5.0 lite"
    assert normalize_model_name("Seedream 5.0 Lite (260128)") == "seedream 5.0 lite"


def test_normalize_wan_aliases():
    assert normalize_model_name("Wan 2.6 T2V") == "wan2.6-t2v"
    assert normalize_model_name("Wan 2.6 I2V Flash") == "wan2.6-i2v-flash"
    assert normalize_model_name("Wan 2.5 T2V Preview") == "wan2.5-t2v-preview"


def test_calculate_formula_credits_cost_uses_new_exchange_rate_for_images():
    credits_cost = calculate_formula_credits_cost(
        "DoubaoImageCreator",
        "seedream 4.5",
        {"image_count": {"value": 1}},
    )

    assert credits_cost == 30


def test_calculate_formula_credits_cost_keeps_rounding_at_final_step():
    credits_cost = calculate_formula_credits_cost(
        "DoubaoImageCreator",
        "seedream 5.0 lite",
        {"image_count": {"value": 1}},
    )

    assert credits_cost == 26


def test_calculate_formula_credits_cost_uses_new_exchange_rate_for_gemini():
    credits_cost = calculate_formula_credits_cost(
        "TextCreation",
        "gemini-3-pro-preview",
        None,
        usage_sources=[{}],
    )

    assert credits_cost == 5


def test_calculate_formula_credits_cost_for_wan26_t2v():
    credits_cost = calculate_formula_credits_cost(
        "DoubaoVideoGenerator",
        "wan2.6",
        {
            "resolution": {"value": "720p"},
            "duration": {"value": 5},
        },
    )

    assert credits_cost == 360


def test_calculate_formula_credits_cost_for_wan26_i2v_with_audio():
    credits_cost = calculate_formula_credits_cost(
        "DoubaoVideoGenerator",
        "wan2.6",
        {
            "resolution": {"value": "1080p"},
            "duration": {"value": 5},
            "enable_audio": {"value": True},
            "first_frame_image": {"value": [{"name": "frame.png"}], "file_path": ["flows/demo/frame.png"]},
        },
    )

    assert credits_cost == 600


def test_calculate_formula_credits_cost_for_wan26_i2v_flash_without_audio():
    credits_cost = calculate_formula_credits_cost(
        "DoubaoVideoGenerator",
        "wan2.6",
        {
            "resolution": {"value": "720p"},
            "duration": {"value": 5},
            "enable_audio": {"value": False},
            "first_frame_image": {"value": [{"name": "frame.png"}], "file_path": ["flows/demo/frame.png"]},
        },
    )

    assert credits_cost == 90


def test_calculate_formula_credits_cost_for_wan26_r2v_defaults_to_non_flash_tier():
    credits_cost = calculate_formula_credits_cost(
        "DoubaoVideoGenerator",
        "wan2.6",
        {
            "resolution": {"value": "720p"},
            "duration": {"value": 10},
            "first_frame_image": {"value": [{"name": "clip.mp4"}], "file_path": ["flows/demo/clip.mp4"]},
        },
    )

    assert credits_cost == 720


def test_calculate_formula_credits_cost_for_wan25_i2v_preview():
    credits_cost = calculate_formula_credits_cost(
        "DoubaoVideoGenerator",
        "wan2.5",
        {
            "resolution": {"value": "1080p"},
            "duration": {"value": 10},
            "first_frame_image": {"value": [{"name": "frame.png"}], "file_path": ["flows/demo/frame.png"]},
        },
    )

    assert credits_cost == 1200


@pytest.mark.asyncio
async def test_get_pricing_rules_upgrades_legacy_default_costs(async_session):
    legacy_rule = CreditPricingRule(
        resource_type=CreditResourceType.IMAGE,
        component_key="DoubaoImageCreator",
        model_key="seedream 4.0",
        display_name="Seedream 4.0",
        credits_cost=2,
        is_active=True,
    )
    async_session.add(legacy_rule)
    await async_session.commit()

    rules = await get_pricing_rules(async_session)
    rule_map = {(rule.component_key, rule.model_key): rule for rule in rules}

    assert rule_map[("DoubaoImageCreator", "seedream 4.0")].credits_cost == 24
