from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from lfx.log.logger import logger

CONFIG_FILENAME = "provider_credentials.json"
DEFAULT_PROVIDER_KEY = "model_provider"


@dataclass
class ProviderCredentials:
    app_id: str | None = None
    access_token: str | None = None
    api_key: str | None = None
    updated_at: str | None = None


def _config_path(config_dir: str | Path) -> Path:
    path = Path(config_dir) / CONFIG_FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _load_all(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        logger.warning("provider credential file %s is not valid JSON; ignoring", path)
        return {}
    except Exception as exc:  # noqa: BLE001
        logger.exception("error reading provider credentials file %s", path, exc_info=exc)
        return {}


def _save_all(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def mask_secret(secret: str | None) -> str | None:
    if not secret:
        return None
    stripped = secret.strip()
    if len(stripped) <= 4:
        return "****"
    return f"****{stripped[-4:]}"


def get_provider_credentials(provider: str, config_dir: str | Path) -> ProviderCredentials:
    path = _config_path(config_dir)
    data = _load_all(path).get(provider, {})
    return ProviderCredentials(
        app_id=data.get("app_id") or None,
        access_token=data.get("access_token") or None,
        api_key=data.get("api_key") or None,
        updated_at=data.get("updated_at") or None,
    )


def save_provider_credentials(
    provider: str, payload: dict[str, str | None], config_dir: str | Path
) -> ProviderCredentials:
    path = _config_path(config_dir)
    all_data = _load_all(path)
    existing = all_data.get(provider, {})

    def merge_field(field: str) -> str | None:
        if field not in payload:
            # Not provided -> keep existing
            return existing.get(field)
        raw_val = payload.get(field)
        if raw_val is None:
            # Explicitly skip update when None (used by UI for untouched fields)
            return existing.get(field)
        # Allow clearing by sending empty string
        trimmed = raw_val.strip()
        # UI may send masked secrets like "****1234" for unchanged values; never persist those.
        if trimmed.startswith("****"):
            return existing.get(field)
        return trimmed or None

    merged = {
        "app_id": merge_field("app_id"),
        "access_token": merge_field("access_token"),
        "api_key": merge_field("api_key"),
        "updated_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    all_data[provider] = merged
    _save_all(path, all_data)
    return get_provider_credentials(provider, config_dir)
