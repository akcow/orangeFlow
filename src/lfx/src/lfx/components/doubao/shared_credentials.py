from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Callable

from lfx.utils.provider_credentials import (
    DEFAULT_PROVIDER_KEY,
    ProviderCredentials,
    get_provider_credentials,
)

try:
    from langflow.services.deps import get_settings_service
except Exception:  # pragma: no cover
    get_settings_service = None  # type: ignore


@dataclass
class SharedCredentials:
    app_id: str | None = None
    access_token: str | None = None
    api_key: str | None = None


def _load_shared() -> ProviderCredentials | None:
    if get_settings_service is None:
        return None
    try:
        settings_service = get_settings_service()
        return get_provider_credentials(DEFAULT_PROVIDER_KEY, settings_service.settings.config_dir)
    except Exception:
        return None


def resolve_credentials(
    component_app_id: str | None,
    component_access_token: str | None,
    component_api_key: str | None,
    env_app_id_var: str = "TTS_APP_ID",
    env_access_token_var: str = "TTS_TOKEN",
    env_api_key_var: str = "ARK_API_KEY",
) -> SharedCredentials:
    """Resolve credentials with priority: component input > shared config > env."""
    shared = _load_shared() or ProviderCredentials()

    def pick(
        direct_value: str | None,
        shared_value: str | None,
        env_var: str,
        transform: Callable[[str], str] | None = None,
    ) -> str:
        if direct_value:
            return direct_value.strip()
        if shared_value:
            return shared_value.strip()
        env_val = os.getenv(env_var, "").strip()
        return transform(env_val) if env_val and transform else env_val

    return SharedCredentials(
        app_id=pick(component_app_id, shared.app_id, env_app_id_var),
        access_token=pick(component_access_token, shared.access_token, env_access_token_var),
        api_key=pick(component_api_key, shared.api_key, env_api_key_var),
    )
