import pytest
from langflow.services.auth.utils import get_password_hash
from langflow.services.database.models.user import User
from langflow.services.deps import session_scope
from sqlalchemy.exc import IntegrityError
from uuid import uuid4


@pytest.fixture
def test_user():
    return User(
        username="testuser",
        nickname="testuser",
        password=get_password_hash("testpassword"),  # Assuming password needs to be hashed
        is_active=True,
        is_superuser=False,
    )


async def test_login_successful(client, test_user):
    # Adding the test user to the database
    try:
        async with session_scope() as session:
            session.add(test_user)
            await session.commit()
    except IntegrityError:
        pass

    response = await client.post("api/v1/login", data={"username": "testuser", "password": "testpassword"})
    assert response.status_code == 200
    assert "access_token" in response.json()


async def test_login_unsuccessful_wrong_username(client):
    response = await client.post("api/v1/login", data={"username": "wrongusername", "password": "testpassword"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect username or password"


async def test_login_unsuccessful_wrong_password(client, test_user, async_session):
    # Adding the test user to the database
    async_session.add(test_user)
    await async_session.commit()

    response = await client.post("api/v1/login", data={"username": "testuser", "password": "wrongpassword"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect username or password"


async def test_login_cookie_auth_can_access_protected_route(client):
    username = f"cookie-{uuid4().hex}@example.com"
    password = "testpassword"
    user = User(
        username=username,
        nickname=username,
        password=get_password_hash(password),
        is_active=True,
        is_superuser=False,
    )
    async with session_scope() as session:
        session.add(user)
        await session.commit()

    login_response = await client.post("api/v1/login", data={"username": username, "password": password})
    assert login_response.status_code == 200

    response = await client.get("api/v1/users/whoami")
    assert response.status_code == 200
    assert response.json()["username"] == username
