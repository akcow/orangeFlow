import pytest
from jose import jwt


def test_resolve_provider_kling_from_env(monkeypatch):
    monkeypatch.setenv("KLING_API_KEY", "sk-test-kling")
    monkeypatch.setenv("KLING_API_BASE", "https://api-beijing.klingai.com")

    from langflow.gateway.router import resolve_provider
    from langflow.gateway.providers.kling import KlingProvider

    name, provider = resolve_provider("kling-video-o1")
    assert name == "kling"
    assert isinstance(provider, KlingProvider)
    assert provider.api_key == "sk-test-kling"


def test_resolve_provider_kling_missing_key(monkeypatch):
    monkeypatch.delenv("KLING_API_KEY", raising=False)
    monkeypatch.delenv("KLING_ACCESS_KEY", raising=False)
    monkeypatch.delenv("KLING_ACCESSKEY", raising=False)
    monkeypatch.delenv("KLING_SECRET_KEY", raising=False)
    monkeypatch.delenv("KLING_SECRETKEY", raising=False)

    from langflow.gateway.router import resolve_provider
    from langflow.gateway.errors import GatewayError

    with pytest.raises(GatewayError):
        resolve_provider("kling-video-o1")


def test_resolve_provider_kling_from_access_secret_env(monkeypatch):
    monkeypatch.delenv("KLING_API_KEY", raising=False)
    monkeypatch.setenv("KLING_ACCESS_KEY", "ak-test-kling")
    monkeypatch.setenv("KLING_SECRET_KEY", "sk-test-kling")
    monkeypatch.setenv("KLING_API_BASE", "https://api-beijing.klingai.com")

    from langflow.gateway.router import resolve_provider
    from langflow.gateway.providers.kling import KlingProvider

    name, provider = resolve_provider("kling-video-o1")
    assert name == "kling"
    assert isinstance(provider, KlingProvider)
    assert provider.api_key.count(".") == 2

    header = jwt.get_unverified_header(provider.api_key)
    claims = jwt.get_unverified_claims(provider.api_key)
    assert header["alg"] == "HS256"
    assert header["typ"] == "JWT"
    assert claims["iss"] == "ak-test-kling"
    assert claims["exp"] - claims["nbf"] == 1805
