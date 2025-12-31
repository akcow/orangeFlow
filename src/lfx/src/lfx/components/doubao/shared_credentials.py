from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

try:
    from dotenv import load_dotenv  # type: ignore

    def _load_dotenv_best_effort() -> None:
        # 1) default behavior (cwd + parents)
        load_dotenv(override=False)

        if os.getenv("ARK_API_KEY") or os.getenv("TTS_APP_ID") or os.getenv("TTS_TOKEN"):
            return

        def walk_up(start: Path, max_levels: int = 8) -> list[Path]:
            paths: list[Path] = []
            current = start.resolve()
            for _ in range(max_levels):
                paths.append(current / ".env")
                if current.parent == current:
                    break
                current = current.parent
            return paths

        candidates: list[Path] = []
        try:
            candidates.extend(walk_up(Path.cwd(), max_levels=10))
        except Exception:
            pass
        try:
            candidates.extend(walk_up(Path(__file__).resolve(), max_levels=12))
        except Exception:
            pass

        for candidate in candidates:
            if candidate.exists():
                load_dotenv(dotenv_path=candidate, override=False)
                break

    _load_dotenv_best_effort()
except Exception:  # pragma: no cover
    # Env file loading is best-effort; values may still come from the process env.
    pass

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
    """Resolve credentials with priority: env/.env > shared config.

    Note: Per-node credential overrides are intentionally ignored to keep the UI simple
    and avoid accidental persistence of masked/partial secrets in flows.
    """
    shared = _load_shared() or ProviderCredentials()

    def pick(
        direct_value: str | None,
        shared_value: str | None,
        env_var: str,
        transform: Callable[[str], str] | None = None,
    ) -> str:
        _ = direct_value
        env_val = os.getenv(env_var, "").strip()
        if env_val:
            return transform(env_val) if transform else env_val

        # Fallback to saved shared config only when env is not set.
        # Never accept masked placeholder values like "****1234".
        if shared_value:
            trimmed = shared_value.strip()
            if trimmed and not trimmed.startswith("****"):
                return trimmed
        return ""

    return SharedCredentials(
        app_id=pick(component_app_id, shared.app_id, env_app_id_var),
        access_token=pick(component_access_token, shared.access_token, env_access_token_var),
        api_key=pick(component_api_key, shared.api_key, env_api_key_var),
    )
