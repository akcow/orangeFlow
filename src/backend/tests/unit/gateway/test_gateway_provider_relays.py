from types import SimpleNamespace


def test_resolve_provider_from_admin_relay_config(monkeypatch, tmp_path):
    from lfx.utils.provider_relays import create_provider_relay
    import importlib

    create_provider_relay(
        {
            "name": "OpenAI Relay",
            "service_type": "text",
            "provider": "openai",
            "base_url": "https://relay.example.com/v1",
            "api_key": "relay-secret",
            "model_patterns": ["gpt-*"],
            "priority": 10,
            "enabled": True,
        },
        tmp_path,
    )

    router_module = importlib.import_module("langflow.gateway.router")
    from langflow.gateway.providers.openai import OpenAIProvider

    monkeypatch.setattr(
        router_module,
        "get_settings_service",
        lambda: SimpleNamespace(settings=SimpleNamespace(config_dir=str(tmp_path))),
    )
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    name, provider = router_module.resolve_provider("gpt-4.1", service_type="text")

    assert name == "openai"
    assert isinstance(provider, OpenAIProvider)
    assert provider.api_key == "relay-secret"
    assert provider.base_url == "https://relay.example.com/v1"


def test_resolve_provider_prefers_lowest_priority_relay(monkeypatch, tmp_path):
    from lfx.utils.provider_relays import create_provider_relay
    import importlib

    create_provider_relay(
        {
            "name": "Fallback Relay",
            "service_type": "text",
            "provider": "openai",
            "base_url": "https://relay-b.example.com/v1",
            "api_key": "relay-b",
            "model_patterns": ["gpt-*"],
            "priority": 50,
            "enabled": True,
        },
        tmp_path,
    )
    create_provider_relay(
        {
            "name": "Primary Relay",
            "service_type": "text",
            "provider": "openai",
            "base_url": "https://relay-a.example.com/v1",
            "api_key": "relay-a",
            "model_patterns": ["gpt-*"],
            "priority": 10,
            "enabled": True,
        },
        tmp_path,
    )

    router_module = importlib.import_module("langflow.gateway.router")

    monkeypatch.setattr(
        router_module,
        "get_settings_service",
        lambda: SimpleNamespace(settings=SimpleNamespace(config_dir=str(tmp_path))),
    )

    _name, provider = router_module.resolve_provider("gpt-4.1-mini", service_type="text")

    assert provider.api_key == "relay-a"
    assert provider.base_url == "https://relay-a.example.com/v1"


def test_builtin_relay_is_used_when_credentials_are_saved(tmp_path):
    from lfx.utils.provider_credentials import save_provider_credentials
    from lfx.utils.provider_relays import get_matching_provider_relay

    save_provider_credentials(
        provider="gemini",
        payload={"api_key": "gemini-secret"},
        config_dir=tmp_path,
    )

    relay = get_matching_provider_relay("gemini-2.5-pro", tmp_path, service_type="text")

    assert relay is not None
    assert relay.id == "builtin:12api-gemini"
    assert relay.provider == "12api"
    assert relay.api_key == "gemini-secret"
    assert relay.base_url is not None
