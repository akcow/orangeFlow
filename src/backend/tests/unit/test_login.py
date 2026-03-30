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


async def test_login_without_remember_me_sets_session_auth_cookies(client, test_user):
    try:
        async with session_scope() as session:
            session.add(test_user)
            await session.commit()
    except IntegrityError:
        pass

    response = await client.post(
        "api/v1/login",
        data={"username": "testuser", "password": "testpassword", "remember_me": "false"},
    )

    assert response.status_code == 200
    set_cookie_headers = [header.lower() for header in response.headers.get_list("set-cookie")]

    access_cookie = next(header for header in set_cookie_headers if header.startswith("access_token_lf="))
    refresh_cookie = next(header for header in set_cookie_headers if header.startswith("refresh_token_lf="))
    remember_cookie = next(header for header in set_cookie_headers if header.startswith("remember_me_lf="))

    assert "max-age=" not in access_cookie
    assert "expires=" not in access_cookie
    assert "max-age=" not in refresh_cookie
    assert "expires=" not in refresh_cookie
    assert "remember_me_lf=false" in remember_cookie


async def test_login_with_remember_me_sets_persistent_auth_cookies(client):
    username = f"remember-{uuid4().hex}@example.com"
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

    response = await client.post(
        "api/v1/login",
        data={"username": username, "password": password, "remember_me": "true"},
    )

    assert response.status_code == 200
    set_cookie_headers = [header.lower() for header in response.headers.get_list("set-cookie")]

    access_cookie = next(header for header in set_cookie_headers if header.startswith("access_token_lf="))
    refresh_cookie = next(header for header in set_cookie_headers if header.startswith("refresh_token_lf="))
    remember_cookie = next(header for header in set_cookie_headers if header.startswith("remember_me_lf="))

    assert "max-age=" in access_cookie or "expires=" in access_cookie
    assert "max-age=" in refresh_cookie or "expires=" in refresh_cookie
    assert "remember_me_lf=true" in remember_cookie
    assert "max-age=" in remember_cookie or "expires=" in remember_cookie


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


async def test_refresh_without_remember_me_keeps_session_auth_cookies(client):
    username = f"refresh-session-{uuid4().hex}@example.com"
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

    login_response = await client.post(
        "api/v1/login",
        data={"username": username, "password": password, "remember_me": "false"},
    )
    assert login_response.status_code == 200

    tokens = login_response.json()
    client.cookies.set("refresh_token_lf", tokens["refresh_token"])
    client.cookies.set("remember_me_lf", "false")

    refresh_response = await client.post("api/v1/refresh")
    assert refresh_response.status_code == 200

    set_cookie_headers = [header.lower() for header in refresh_response.headers.get_list("set-cookie")]
    access_cookie = next(header for header in set_cookie_headers if header.startswith("access_token_lf="))
    refresh_cookie = next(header for header in set_cookie_headers if header.startswith("refresh_token_lf="))
    remember_cookie = next(header for header in set_cookie_headers if header.startswith("remember_me_lf="))

    assert "max-age=" not in access_cookie
    assert "expires=" not in access_cookie
    assert "max-age=" not in refresh_cookie
    assert "expires=" not in refresh_cookie
    assert "remember_me_lf=false" in remember_cookie


async def test_refresh_with_remember_me_keeps_persistent_auth_cookies(client):
    username = f"refresh-persistent-{uuid4().hex}@example.com"
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

    login_response = await client.post(
        "api/v1/login",
        data={"username": username, "password": password, "remember_me": "true"},
    )
    assert login_response.status_code == 200

    tokens = login_response.json()
    client.cookies.set("refresh_token_lf", tokens["refresh_token"])
    client.cookies.set("remember_me_lf", "true")

    refresh_response = await client.post("api/v1/refresh")
    assert refresh_response.status_code == 200

    set_cookie_headers = [header.lower() for header in refresh_response.headers.get_list("set-cookie")]
    access_cookie = next(header for header in set_cookie_headers if header.startswith("access_token_lf="))
    refresh_cookie = next(header for header in set_cookie_headers if header.startswith("refresh_token_lf="))
    remember_cookie = next(header for header in set_cookie_headers if header.startswith("remember_me_lf="))

    assert "max-age=" in access_cookie or "expires=" in access_cookie
    assert "max-age=" in refresh_cookie or "expires=" in refresh_cookie
    assert "remember_me_lf=true" in remember_cookie
    assert "max-age=" in remember_cookie or "expires=" in remember_cookie
