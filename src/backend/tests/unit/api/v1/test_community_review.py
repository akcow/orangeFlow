from fastapi import status
from httpx import AsyncClient


async def test_community_review_queue_requires_superuser(
    client: AsyncClient, logged_in_headers, flow
):
    # Create an UNREVIEWED item as a normal user.
    payload = {
        "type": "WORKFLOW",
        "flow_id": str(flow.id),
        "title": "My Workflow",
        "description": "desc",
        "cover_path": None,
        "media_path": None,
        "public_canvas": True,
        "status": "UNREVIEWED",
    }
    create = await client.post("api/v1/community/items", json=payload, headers=logged_in_headers)
    assert create.status_code == status.HTTP_201_CREATED

    # Public list should not include UNREVIEWED items.
    public = await client.get("api/v1/community/items/public", params={"type": "WORKFLOW"})
    assert public.status_code == status.HTTP_200_OK
    assert public.json() == []

    # Normal users cannot access review queue.
    review = await client.get("api/v1/community/items/review", headers=logged_in_headers)
    assert review.status_code == status.HTTP_403_FORBIDDEN


async def test_community_review_queue_approve_makes_item_public(
    client: AsyncClient, logged_in_headers, logged_in_headers_super_user, flow
):
    payload = {
        "type": "WORKFLOW",
        "flow_id": str(flow.id),
        "title": "Workflow To Approve",
        "description": None,
        "cover_path": None,
        "media_path": None,
        "public_canvas": True,
        "status": "UNREVIEWED",
    }
    create = await client.post("api/v1/community/items", json=payload, headers=logged_in_headers)
    assert create.status_code == status.HTTP_201_CREATED
    item_id = create.json()["id"]

    # Superuser can see it in UNREVIEWED review list.
    review = await client.get(
        "api/v1/community/items/review",
        headers=logged_in_headers_super_user,
        params={"status": "UNREVIEWED", "type": "WORKFLOW", "limit": 50, "offset": 0},
    )
    assert review.status_code == status.HTTP_200_OK
    body = review.json()
    assert "total_count" in body
    assert "items" in body
    assert any(it["id"] == item_id for it in body["items"])

    # Approve item.
    approve = await client.post(
        f"api/v1/community/items/{item_id}/approve",
        headers=logged_in_headers_super_user,
    )
    assert approve.status_code == status.HTTP_200_OK
    assert approve.json()["status"] == "PUBLIC"

    # Now appears in public list.
    public = await client.get("api/v1/community/items/public", params={"type": "WORKFLOW"})
    assert public.status_code == status.HTTP_200_OK
    assert any(it["id"] == item_id for it in public.json())

    # Underlying flow becomes publicly readable via /flows/public_flow/{id}.
    public_flow = await client.get(f"api/v1/flows/public_flow/{flow.id}")
    assert public_flow.status_code == status.HTTP_200_OK

