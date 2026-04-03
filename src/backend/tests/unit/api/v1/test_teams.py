from uuid import UUID, uuid4

from fastapi import status
from httpx import AsyncClient
from sqlmodel import select

from langflow.services.auth.utils import get_password_hash
from langflow.services.database.models.team_membership.model import TeamMembership
from langflow.services.database.models.user.model import User
from langflow.services.deps import session_scope


async def _create_user(username: str) -> User:
    async with session_scope() as session:
        user = User(
            username=username,
            nickname=username,
            password=get_password_hash("hashed_password"),
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


async def _login_headers(client: AsyncClient, username: str, password: str) -> dict[str, str]:
    response = await client.post(
        "api/v1/login",
        data={"username": username, "password": password},
    )
    assert response.status_code == status.HTTP_200_OK, response.json()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_owner_can_update_member_role_and_credit_limit(
    client: AsyncClient,
    logged_in_headers,
    user_two,
):
    project_response = await client.post(
        "api/v1/projects/",
        json={"name": f"Team-Owner-Update-{uuid4()}", "description": ""},
        headers=logged_in_headers,
    )
    assert project_response.status_code == status.HTTP_201_CREATED, project_response.json()
    project_id = project_response.json()["id"]

    invite_response = await client.post(
        f"api/v1/teams/{project_id}/invite",
        json={"user_id": str(user_two.id), "role": "MEMBER"},
        headers=logged_in_headers,
    )
    assert invite_response.status_code == status.HTTP_201_CREATED, invite_response.json()

    update_response = await client.patch(
        f"api/v1/teams/{project_id}/members/{user_two.id}",
        json={"role": "ADMIN", "credit_limit": 120},
        headers=logged_in_headers,
    )
    assert update_response.status_code == status.HTTP_200_OK, update_response.json()
    payload = update_response.json()
    assert payload["role"] == "ADMIN"
    assert payload["credit_limit"] == 120
    assert payload["credit_limit_kind"] == "FIXED"
    assert payload["credit_limit_interval"] is None
    assert payload["credits_used"] == 0
    assert payload["credits_remaining"] == 120


async def test_admin_can_edit_credit_limit_but_cannot_change_roles(
    client: AsyncClient,
    logged_in_headers,
    user_two,
):
    member_user = await _create_user(f"team-member-{uuid4()}@example.com")

    project_response = await client.post(
        "api/v1/projects/",
        json={"name": f"Team-Admin-Permissions-{uuid4()}", "description": ""},
        headers=logged_in_headers,
    )
    assert project_response.status_code == status.HTTP_201_CREATED, project_response.json()
    project_id = project_response.json()["id"]

    admin_invite_response = await client.post(
        f"api/v1/teams/{project_id}/invite",
        json={"user_id": str(user_two.id), "role": "ADMIN"},
        headers=logged_in_headers,
    )
    assert admin_invite_response.status_code == status.HTTP_201_CREATED, admin_invite_response.json()

    member_invite_response = await client.post(
        f"api/v1/teams/{project_id}/invite",
        json={"user_id": str(member_user.id), "role": "MEMBER"},
        headers=logged_in_headers,
    )
    assert member_invite_response.status_code == status.HTTP_201_CREATED, member_invite_response.json()

    admin_headers = await _login_headers(
        client,
        user_two.username,
        "hashed_password",
    )

    credit_limit_response = await client.patch(
        f"api/v1/teams/{project_id}/members/{member_user.id}",
        json={"credit_limit": 80},
        headers=admin_headers,
    )
    assert credit_limit_response.status_code == status.HTTP_200_OK, credit_limit_response.json()
    assert credit_limit_response.json()["credit_limit"] == 80
    assert credit_limit_response.json()["credit_limit_kind"] == "FIXED"

    role_change_response = await client.patch(
        f"api/v1/teams/{project_id}/members/{member_user.id}",
        json={"role": "ADMIN"},
        headers=admin_headers,
    )
    assert role_change_response.status_code == status.HTTP_403_FORBIDDEN, role_change_response.json()
    assert role_change_response.json()["detail"] == "Only the team owner can change member roles"


async def test_owner_cannot_change_own_role_or_assign_owner(
    client: AsyncClient,
    logged_in_headers,
    active_user,
    user_two,
):
    project_response = await client.post(
        "api/v1/projects/",
        json={"name": f"Team-Owner-Restrictions-{uuid4()}", "description": ""},
        headers=logged_in_headers,
    )
    assert project_response.status_code == status.HTTP_201_CREATED, project_response.json()
    project_id = project_response.json()["id"]

    invite_response = await client.post(
        f"api/v1/teams/{project_id}/invite",
        json={"user_id": str(user_two.id), "role": "MEMBER"},
        headers=logged_in_headers,
    )
    assert invite_response.status_code == status.HTTP_201_CREATED, invite_response.json()

    self_role_response = await client.patch(
        f"api/v1/teams/{project_id}/members/{active_user.id}",
        json={"role": "ADMIN"},
        headers=logged_in_headers,
    )
    assert self_role_response.status_code == status.HTTP_400_BAD_REQUEST, self_role_response.json()
    assert self_role_response.json()["detail"] == "Owner role cannot be modified"

    self_credit_limit_response = await client.patch(
        f"api/v1/teams/{project_id}/members/{active_user.id}",
        json={"credit_limit": 200},
        headers=logged_in_headers,
    )
    assert self_credit_limit_response.status_code == status.HTTP_200_OK, self_credit_limit_response.json()
    assert self_credit_limit_response.json()["credit_limit"] == 200
    assert self_credit_limit_response.json()["credit_limit_kind"] == "FIXED"
    assert self_credit_limit_response.json()["credits_remaining"] == 200

    assign_owner_response = await client.patch(
        f"api/v1/teams/{project_id}/members/{user_two.id}",
        json={"role": "OWNER"},
        headers=logged_in_headers,
    )
    assert assign_owner_response.status_code == status.HTTP_400_BAD_REQUEST, assign_owner_response.json()
    assert assign_owner_response.json()["detail"] == "Team owner role cannot be assigned"


async def test_admin_can_remove_team_member(
    client: AsyncClient,
    logged_in_headers,
    user_two,
):
    member_user = await _create_user(f"team-remove-{uuid4()}@example.com")

    project_response = await client.post(
        "api/v1/projects/",
        json={"name": f"Team-Admin-Remove-{uuid4()}", "description": ""},
        headers=logged_in_headers,
    )
    assert project_response.status_code == status.HTTP_201_CREATED, project_response.json()
    project_id = project_response.json()["id"]

    admin_invite_response = await client.post(
        f"api/v1/teams/{project_id}/invite",
        json={"user_id": str(user_two.id), "role": "ADMIN"},
        headers=logged_in_headers,
    )
    assert admin_invite_response.status_code == status.HTTP_201_CREATED, admin_invite_response.json()

    member_invite_response = await client.post(
        f"api/v1/teams/{project_id}/invite",
        json={"user_id": str(member_user.id), "role": "MEMBER"},
        headers=logged_in_headers,
    )
    assert member_invite_response.status_code == status.HTTP_201_CREATED, member_invite_response.json()

    admin_headers = await _login_headers(
        client,
        user_two.username,
        "hashed_password",
    )

    delete_response = await client.delete(
        f"api/v1/teams/{project_id}/members/{member_user.id}",
        headers=admin_headers,
    )
    assert delete_response.status_code == status.HTTP_204_NO_CONTENT

    members_response = await client.get(
        f"api/v1/teams/{project_id}/members",
        headers=logged_in_headers,
    )
    assert members_response.status_code == status.HTTP_200_OK, members_response.json()
    remaining_ids = {member["user_id"] for member in members_response.json()}
    assert str(member_user.id) not in remaining_ids


async def test_team_user_search_matches_username_and_email(
    client: AsyncClient,
    logged_in_headers,
):
    searchable_user = await _create_user(f"team-search-{uuid4()}@example.com")

    project_response = await client.post(
        "api/v1/projects/",
        json={"name": f"Team-Search-{uuid4()}", "description": ""},
        headers=logged_in_headers,
    )
    assert project_response.status_code == status.HTTP_201_CREATED, project_response.json()
    project_id = project_response.json()["id"]

    query_fragment = searchable_user.username.split("@", maxsplit=1)[1]
    search_response = await client.get(
        f"api/v1/teams/{project_id}/search-users",
        params={"query": query_fragment},
        headers=logged_in_headers,
    )
    assert search_response.status_code == status.HTTP_200_OK, search_response.json()

    payload = search_response.json()
    assert any(result["user_id"] == str(searchable_user.id) for result in payload)
    matched_user = next(result for result in payload if result["user_id"] == str(searchable_user.id))
    assert matched_user["email"] == searchable_user.username
    assert matched_user["is_member"] is False


async def test_list_teams_includes_owner_legacy_folder_without_membership(
    client: AsyncClient,
    logged_in_headers,
    active_user,
):
    project_response = await client.post(
        "api/v1/projects/",
        json={"name": f"Legacy-Owned-Team-{uuid4()}", "description": ""},
        headers=logged_in_headers,
    )
    assert project_response.status_code == status.HTTP_201_CREATED, project_response.json()
    project_id = project_response.json()["id"]
    project_uuid = UUID(project_id)

    async with session_scope() as session:
        owner_membership = (
            await session.exec(
                select(TeamMembership).where(
                    TeamMembership.folder_id == project_uuid,
                    TeamMembership.user_id == active_user.id,
                )
            )
        ).first()
        assert owner_membership is not None
        await session.delete(owner_membership)
        await session.commit()

    teams_response = await client.get("api/v1/teams/", headers=logged_in_headers)
    assert teams_response.status_code == status.HTTP_200_OK, teams_response.json()

    payload = teams_response.json()
    matching_team = next((team for team in payload if team["id"] == project_id), None)
    assert matching_team is not None
    assert matching_team["current_user_role"] == "OWNER"
    assert matching_team["member_count"] >= 1


async def test_owner_can_set_recurring_credit_limit(
    client: AsyncClient,
    logged_in_headers,
    user_two,
):
    project_response = await client.post(
        "api/v1/projects/",
        json={"name": f"Team-Recurring-Limit-{uuid4()}", "description": ""},
        headers=logged_in_headers,
    )
    assert project_response.status_code == status.HTTP_201_CREATED, project_response.json()
    project_id = project_response.json()["id"]

    invite_response = await client.post(
        f"api/v1/teams/{project_id}/invite",
        json={"user_id": str(user_two.id), "role": "MEMBER"},
        headers=logged_in_headers,
    )
    assert invite_response.status_code == status.HTTP_201_CREATED, invite_response.json()

    update_response = await client.patch(
        f"api/v1/teams/{project_id}/members/{user_two.id}",
        json={
            "credit_limit": 60,
            "credit_limit_kind": "RECURRING",
            "credit_limit_interval": "MONTHLY",
        },
        headers=logged_in_headers,
    )
    assert update_response.status_code == status.HTTP_200_OK, update_response.json()
    payload = update_response.json()
    assert payload["credit_limit"] == 60
    assert payload["credit_limit_kind"] == "RECURRING"
    assert payload["credit_limit_interval"] == "MONTHLY"
    assert payload["credits_remaining"] == 60


async def test_owner_can_set_weekly_recurring_credit_limit(
    client: AsyncClient,
    logged_in_headers,
    user_two,
):
    project_response = await client.post(
        "api/v1/projects/",
        json={"name": f"Team-Weekly-Limit-{uuid4()}", "description": ""},
        headers=logged_in_headers,
    )
    assert project_response.status_code == status.HTTP_201_CREATED, project_response.json()
    project_id = project_response.json()["id"]

    invite_response = await client.post(
        f"api/v1/teams/{project_id}/invite",
        json={"user_id": str(user_two.id), "role": "MEMBER"},
        headers=logged_in_headers,
    )
    assert invite_response.status_code == status.HTTP_201_CREATED, invite_response.json()

    update_response = await client.patch(
        f"api/v1/teams/{project_id}/members/{user_two.id}",
        json={
            "credit_limit": 45,
            "credit_limit_kind": "RECURRING",
            "credit_limit_interval": "WEEKLY",
        },
        headers=logged_in_headers,
    )
    assert update_response.status_code == status.HTTP_200_OK, update_response.json()
    payload = update_response.json()
    assert payload["credit_limit"] == 45
    assert payload["credit_limit_kind"] == "RECURRING"
    assert payload["credit_limit_interval"] == "WEEKLY"
    assert payload["credits_remaining"] == 45


async def test_member_can_leave_team(
    client: AsyncClient,
    logged_in_headers,
    user_two,
):
    project_response = await client.post(
        "api/v1/projects/",
        json={"name": f"Team-Leave-{uuid4()}", "description": ""},
        headers=logged_in_headers,
    )
    assert project_response.status_code == status.HTTP_201_CREATED, project_response.json()
    project_id = project_response.json()["id"]

    invite_response = await client.post(
        f"api/v1/teams/{project_id}/invite",
        json={"user_id": str(user_two.id), "role": "MEMBER"},
        headers=logged_in_headers,
    )
    assert invite_response.status_code == status.HTTP_201_CREATED, invite_response.json()

    member_headers = await _login_headers(client, user_two.username, "hashed_password")

    leave_response = await client.delete(
        f"api/v1/teams/{project_id}/leave",
        headers=member_headers,
    )
    assert leave_response.status_code == status.HTTP_204_NO_CONTENT

    members_response = await client.get(
        f"api/v1/teams/{project_id}/members",
        headers=logged_in_headers,
    )
    assert members_response.status_code == status.HTTP_200_OK, members_response.json()
    remaining_ids = {member["user_id"] for member in members_response.json()}
    assert str(user_two.id) not in remaining_ids
