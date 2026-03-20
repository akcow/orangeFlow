from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import AsyncClient

from langflow.services.credits.service import (
    ChargeableBuildItem,
    adjust_user_credits,
    apply_usage_charge,
    ensure_sufficient_balance_for_items,
    get_or_create_credit_account,
    normalize_model_name,
)
from langflow.services.database.models.credit.model import CreditResourceType
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
