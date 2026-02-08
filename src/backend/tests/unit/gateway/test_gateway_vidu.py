import pytest


def test_resolve_provider_vidu_from_env(monkeypatch):
    monkeypatch.setenv("VIDU_API_KEY", "sk-test-vidu")
    monkeypatch.setenv("VIDU_API_BASE", "https://api.vidu.cn")

    from langflow.gateway.router import resolve_provider
    from langflow.gateway.providers.vidu import ViduProvider

    name, provider = resolve_provider("viduq3-pro")
    assert name == "vidu"
    assert isinstance(provider, ViduProvider)
    assert provider.api_key == "sk-test-vidu"


def test_resolve_provider_vidu_missing_key(monkeypatch):
    monkeypatch.delenv("VIDU_API_KEY", raising=False)

    from langflow.gateway.router import resolve_provider
    from langflow.gateway.errors import GatewayError

    with pytest.raises(GatewayError):
        resolve_provider("viduq3-pro")

