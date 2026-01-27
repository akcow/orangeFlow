import pytest


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

    from langflow.gateway.router import resolve_provider
    from langflow.gateway.errors import GatewayError

    with pytest.raises(GatewayError):
        resolve_provider("kling-video-o1")

