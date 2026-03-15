from uuid import UUID, uuid4

from httpx import AsyncClient
from langflow.services.database.models.team_membership.crud import ensure_team_membership
from langflow.services.database.models.team_membership.model import TeamRoleEnum
from langflow.services.database.models.user.model import User
from langflow.services.database.utils import session_getter
from langflow.services.deps import get_db_service
from sqlmodel import select


async def test_regular_user_cannot_create_admin_notification(
    client: AsyncClient,
    logged_in_headers,
):
    response = await client.post(
        "api/v1/notifications/",
        json={
            "title": "Platform Notice",
            "content": "Hello",
            "target_type": "ALL",
            "user_ids": [],
            "team_ids": [],
        },
        headers=logged_in_headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Superuser only"


async def test_superuser_notification_read_and_hide_flow(
    client: AsyncClient,
    active_user,
    logged_in_headers,
    logged_in_headers_super_user,
):
    create_response = await client.post(
        "api/v1/notifications/",
        json={
            "title": "Maintenance Window",
            "content": "Planned maintenance tonight.",
            "target_type": "USERS",
            "user_ids": [str(active_user.id)],
            "team_ids": [],
        },
        headers=logged_in_headers_super_user,
    )

    assert create_response.status_code == 201, create_response.json()
    assert create_response.json()["recipient_count"] == 1

    mine_response = await client.get("api/v1/notifications/mine", headers=logged_in_headers)
    assert mine_response.status_code == 200, mine_response.json()
    notifications = mine_response.json()
    assert len(notifications) == 1
    assert notifications[0]["title"] == "Maintenance Window"
    assert notifications[0]["read_at"] is None

    read_all_response = await client.post(
        "api/v1/notifications/mine/read-all",
        headers=logged_in_headers,
    )
    assert read_all_response.status_code == 200, read_all_response.json()
    assert read_all_response.json()["updated_count"] == 1

    refreshed_response = await client.get("api/v1/notifications/mine", headers=logged_in_headers)
    refreshed_notifications = refreshed_response.json()
    assert refreshed_notifications[0]["read_at"] is not None

    recipient_id = refreshed_notifications[0]["recipient_id"]
    hide_response = await client.delete(
        f"api/v1/notifications/mine/{recipient_id}",
        headers=logged_in_headers,
    )
    assert hide_response.status_code == 200, hide_response.json()

    hidden_response = await client.get("api/v1/notifications/mine", headers=logged_in_headers)
    assert hidden_response.status_code == 200, hidden_response.json()
    assert hidden_response.json() == []


async def test_team_targeted_notification_is_visible_to_team_member(
    client: AsyncClient,
    user_two: User,
    logged_in_headers_super_user,
):
    project_response = await client.post(
        "api/v1/projects/",
        json={"name": f"Team-{uuid4()}", "description": ""},
        headers=logged_in_headers_super_user,
    )
    assert project_response.status_code == 201, project_response.json()
    project_id = UUID(project_response.json()["id"])

    async with session_getter(get_db_service()) as session:
        await ensure_team_membership(
            session,
            folder_id=project_id,
            user_id=user_two.id,
            role=TeamRoleEnum.MEMBER,
        )
        stmt = select(User).where(User.id == user_two.id)
        team_user = (await session.exec(stmt)).first()
        assert team_user is not None

    login_response = await client.post(
        "api/v1/login",
        data={"username": user_two.username, "password": "hashed_password"},
    )
    assert login_response.status_code == 200, login_response.json()
    team_user_headers = {
        "Authorization": f"Bearer {login_response.json()['access_token']}",
    }

    create_response = await client.post(
        "api/v1/notifications/",
        json={
            "title": "Team Update",
            "content": "Shared with team members only.",
            "target_type": "TEAMS",
            "user_ids": [],
            "team_ids": [str(project_id)],
        },
        headers=logged_in_headers_super_user,
    )
    assert create_response.status_code == 201, create_response.json()

    mine_response = await client.get("api/v1/notifications/mine", headers=team_user_headers)
    assert mine_response.status_code == 200, mine_response.json()
    notifications = mine_response.json()
    assert len(notifications) == 1
    assert notifications[0]["title"] == "Team Update"
