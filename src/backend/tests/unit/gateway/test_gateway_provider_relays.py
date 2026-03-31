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


def test_resolve_jimeng_provider_from_admin_relay_config(monkeypatch, tmp_path):
    from lfx.utils.provider_relays import create_provider_relay
    import importlib

    create_provider_relay(
        {
            "name": "Jimeng Relay",
            "service_type": "image",
            "provider": "jimeng",
            "base_url": "https://visual-proxy.example.com",
            "access_key": "jimeng-ak",
            "secret_key": "jimeng-sk",
            "model_patterns": ["jimeng-smart-hd"],
            "priority": 10,
            "enabled": True,
        },
        tmp_path,
    )

    router_module = importlib.import_module("langflow.gateway.router")
    from langflow.gateway.providers.jimeng_visual import JimengVisualProvider

    monkeypatch.setattr(
        router_module,
        "get_settings_service",
        lambda: SimpleNamespace(settings=SimpleNamespace(config_dir=str(tmp_path))),
    )
    monkeypatch.delenv("JIMENG_CV_ACCESS_KEY", raising=False)
    monkeypatch.delenv("JIMENG_CV_SECRET_KEY", raising=False)

    name, provider = router_module.resolve_provider("jimeng-smart-hd", service_type="image")

    assert name == "jimeng"
    assert isinstance(provider, JimengVisualProvider)
    assert provider.access_key == "jimeng-ak"
    assert provider.secret_key == "jimeng-sk"
    assert provider.base_url == "https://visual-proxy.example.com"


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


def test_builtin_jimeng_relay_is_used_when_credentials_are_saved(tmp_path):
    from lfx.utils.provider_credentials import save_provider_credentials
    from lfx.utils.provider_relays import get_matching_provider_relay

    save_provider_credentials(
        provider="jimeng_visual",
        payload={"app_id": "jimeng-ak", "access_token": "jimeng-sk"},
        config_dir=tmp_path,
    )

    relay = get_matching_provider_relay("jimeng-smart-hd", tmp_path, service_type="image")

    assert relay is not None
    assert relay.id == "builtin:jimeng-image"
    assert relay.provider == "jimeng"
    assert relay.access_key == "jimeng-ak"
    assert relay.secret_key == "jimeng-sk"
    assert relay.base_url is not None


def test_gateway_model_catalog_contains_all_exact_models():
    from langflow.gateway.model_catalog import list_gateway_model_catalog

    catalog = list_gateway_model_catalog()
    model_ids = {item.id for item in catalog}
    full_names = [item.full_name for item in catalog]

    assert len(catalog) == 45
    assert len(model_ids) == len(catalog)
    assert len(set(full_names)) == len(catalog)
    assert {
        "gpt-4.1-nano",
        "doubao-seedance-1-0-pro-250528",
        "jimeng-smart-hd",
        "wanx2.1-imageedit",
        "qwen-image-edit-max",
        "kling-image-o1",
        "kling-video-o1",
    }.issubset(model_ids)


def test_gateway_model_catalog_compatibility_views_cover_new_models():
    from langflow.gateway.model_catalog import (
        find_gateway_model_by_full_name,
        list_gateway_models_payload,
        list_model_page_records,
    )

    assert len(list_gateway_models_payload()) == 45
    assert len(list_model_page_records("chat")) == 9
    assert len(list_model_page_records("image")) == 15
    assert len(list_model_page_records("video")) == 20
    assert len(list_model_page_records("audio")) == 1

    assert find_gateway_model_by_full_name("GPT-4.1 Nano") == {
        "id": "gpt-4.1-nano",
        "fullName": "GPT-4.1 Nano",
        "type": "chat",
    }
    assert find_gateway_model_by_full_name("Doubao Seedance 1.0 Pro") == {
        "id": "doubao-seedance-1-0-pro-250528",
        "fullName": "Doubao Seedance 1.0 Pro",
        "type": "video",
    }
    assert find_gateway_model_by_full_name("WanX 2.1 Image Edit") == {
        "id": "wanx2.1-imageedit",
        "fullName": "WanX 2.1 Image Edit",
        "type": "image",
    }
    assert find_gateway_model_by_full_name("Jimeng Smart HD") == {
        "id": "jimeng-smart-hd",
        "fullName": "Jimeng Smart HD",
        "type": "image",
    }
    assert find_gateway_model_by_full_name("Kling O1 Video") == {
        "id": "kling-video-o1",
        "fullName": "Kling O1 Video",
        "type": "video",
    }


def test_provider_relay_model_catalog_handler_returns_expanded_catalog():
    from langflow.api.v1.provider_relays import get_provider_relay_model_catalog_handler

    payload = get_provider_relay_model_catalog_handler()
    by_id = {item.id: item for item in payload}

    assert len(payload) == 45
    assert by_id["gpt-4.1-nano"].full_name == "GPT-4.1 Nano"
    assert by_id["jimeng-smart-hd"].relay_provider == "jimeng"
    assert by_id["wanx2.1-imageedit"].relay_provider == "dashscope"
    assert by_id["doubao-seedance-1-0-pro-250528"].relay_service_type == "video"
    assert by_id["kling-image-o1"].full_name == "Kling O1 Image"
    assert by_id["kling-video-o1"].full_name == "Kling O1 Video"
