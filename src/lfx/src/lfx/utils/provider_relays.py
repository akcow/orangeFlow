from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from fnmatch import fnmatchcase
from pathlib import Path
from typing import Any
from uuid import uuid4

from lfx.log.logger import logger
from lfx.utils.provider_credentials import get_provider_credentials, mask_secret, save_provider_credentials

CONFIG_FILENAME = "provider_relays.json"
SUPPORTED_RELAY_PROVIDERS = (
    "openai",
    "12api",
    "gemini",
    "doubao",
    "dashscope",
    "qwen",
    "sora",
    "veo",
    "vidu",
    "kling",
    "jimeng",
)
SUPPORTED_RELAY_SERVICE_TYPES = ("any", "text", "image", "video", "audio")


@dataclass
class ProviderRelay:
    id: str
    name: str
    service_type: str
    provider: str
    base_url: str | None
    api_key: str | None
    access_key: str | None
    secret_key: str | None
    model_patterns: list[str]
    priority: int
    enabled: bool
    is_default: bool = False
    created_at: str | None = None
    updated_at: str | None = None
    managed_via: str = "relay"
    system_default: bool = False
    credential_provider: str | None = None
    deletable: bool = True
    reorderable: bool = True
    editable_fields: list[str] | None = None


def _config_path(config_dir: str | Path) -> Path:
    path = Path(config_dir) / CONFIG_FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _load_all(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        logger.warning("provider relay file %s is not valid JSON; ignoring", path)
        return []
    except Exception as exc:  # noqa: BLE001
        logger.exception("error reading provider relay file %s", path, exc_info=exc)
        return []

    if not isinstance(raw, list):
        logger.warning("provider relay file %s is not a list; ignoring", path)
        return []
    return [item for item in raw if isinstance(item, dict)]


def _save_all(path: Path, payload: list[dict[str, Any]]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _normalize_provider(value: str | None) -> str | None:
    cleaned = _normalize_optional_text(value)
    return cleaned.lower() if cleaned else None


def _normalize_service_type(value: str | None) -> str:
    cleaned = _normalize_provider(value) or "any"
    if cleaned not in SUPPORTED_RELAY_SERVICE_TYPES:
        msg = f"Unsupported relay service type: {cleaned}"
        raise ValueError(msg)
    return cleaned


def _normalize_api_key(value: str | None) -> str | None:
    cleaned = _normalize_optional_text(value)
    if not cleaned:
        return None
    if cleaned.lower().startswith("bearer "):
        cleaned = cleaned.split(" ", 1)[1].strip()
    if cleaned.startswith("****"):
        return None
    return "".join(cleaned.split()) or None


def _normalize_access_key(value: str | None) -> str | None:
    cleaned = _normalize_optional_text(value)
    if not cleaned or cleaned.startswith("****"):
        return None
    return "".join(cleaned.split()) or None


def _normalize_secret_key(value: str | None) -> str | None:
    cleaned = _normalize_optional_text(value)
    if not cleaned or cleaned.startswith("****"):
        return None
    return "".join(cleaned.split()) or None


def _normalize_model_patterns(value: list[str] | None) -> list[str]:
    patterns = []
    for pattern in value or []:
        cleaned = (pattern or "").strip()
        if cleaned:
            patterns.append(cleaned)
    return patterns


def _sort_relays(relays: list[ProviderRelay]) -> list[ProviderRelay]:
    return sorted(
        relays,
        key=lambda relay: (
            relay.priority,
            relay.service_type != "any",
            relay.name.lower(),
            relay.created_at or "",
        ),
    )


def _coerce_relay(raw: dict[str, Any]) -> ProviderRelay | None:
    try:
        relay_id = _normalize_optional_text(str(raw.get("id") or "")) or str(uuid4())
        name = _normalize_optional_text(raw.get("name"))
        provider = _normalize_provider(raw.get("provider"))
        if not name or not provider:
            return None
        if provider not in SUPPORTED_RELAY_PROVIDERS:
            logger.warning("unsupported relay provider %s ignored", provider)
            return None

        priority_raw = raw.get("priority", 100)
        priority = int(priority_raw)

        return ProviderRelay(
            id=relay_id,
            name=name,
            service_type=_normalize_service_type(raw.get("service_type")),
            provider=provider,
            base_url=_normalize_optional_text(raw.get("base_url")),
            api_key=_normalize_api_key(raw.get("api_key")),
            access_key=_normalize_access_key(raw.get("access_key")),
            secret_key=_normalize_secret_key(raw.get("secret_key")),
            model_patterns=_normalize_model_patterns(raw.get("model_patterns")),
            priority=priority,
            enabled=bool(raw.get("enabled", True)),
            is_default=bool(raw.get("is_default", False)),
            created_at=_normalize_optional_text(raw.get("created_at")),
            updated_at=_normalize_optional_text(raw.get("updated_at")),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("failed to coerce provider relay config: %s", exc)
        return None


def _serialize_relay(relay: ProviderRelay, *, include_secrets: bool) -> dict[str, Any]:
    payload = asdict(relay)
    payload.pop("managed_via", None)
    payload.pop("system_default", None)
    payload.pop("credential_provider", None)
    payload.pop("deletable", None)
    payload.pop("reorderable", None)
    payload.pop("editable_fields", None)
    if not include_secrets:
        payload["api_key"] = None
        payload["access_key"] = None
        payload["secret_key"] = None
    return payload


def _require_supported_provider(provider: str | None) -> str:
    cleaned = _normalize_provider(provider)
    if not cleaned:
        raise ValueError("provider is required")
    if cleaned not in SUPPORTED_RELAY_PROVIDERS:
        msg = f"Unsupported relay provider: {cleaned}"
        raise ValueError(msg)
    return cleaned


def _validate_relay_payload(payload: dict[str, Any], *, is_create: bool) -> dict[str, Any]:
    normalized: dict[str, Any] = {}

    if is_create or "name" in payload:
        name = _normalize_optional_text(payload.get("name"))
        if not name:
            raise ValueError("name is required")
        normalized["name"] = name

    if is_create or "provider" in payload:
        normalized["provider"] = _require_supported_provider(payload.get("provider"))

    if is_create or "service_type" in payload:
        normalized["service_type"] = _normalize_service_type(payload.get("service_type"))

    if "base_url" in payload:
        normalized["base_url"] = _normalize_optional_text(payload.get("base_url"))
    elif is_create:
        normalized["base_url"] = None

    if "api_key" in payload:
        raw_api_key = payload.get("api_key")
        if isinstance(raw_api_key, str) and raw_api_key.strip().startswith("****"):
            pass
        else:
            normalized["api_key"] = _normalize_api_key(raw_api_key)
    elif is_create:
        normalized["api_key"] = None

    if "access_key" in payload:
        raw_access_key = payload.get("access_key")
        if isinstance(raw_access_key, str) and raw_access_key.strip().startswith("****"):
            pass
        else:
            normalized["access_key"] = _normalize_access_key(raw_access_key)
    elif is_create:
        normalized["access_key"] = None

    if "secret_key" in payload:
        raw_secret_key = payload.get("secret_key")
        if isinstance(raw_secret_key, str) and raw_secret_key.strip().startswith("****"):
            pass
        else:
            normalized["secret_key"] = _normalize_secret_key(raw_secret_key)
    elif is_create:
        normalized["secret_key"] = None

    if is_create or "model_patterns" in payload:
        normalized["model_patterns"] = _normalize_model_patterns(payload.get("model_patterns"))

    if "priority" in payload:
        normalized["priority"] = int(payload.get("priority"))
    elif is_create:
        normalized["priority"] = 100

    if "enabled" in payload:
        normalized["enabled"] = bool(payload.get("enabled"))
    elif is_create:
        normalized["enabled"] = True

    if "is_default" in payload:
        normalized["is_default"] = bool(payload.get("is_default"))
    elif is_create:
        normalized["is_default"] = False

    return normalized


def _dedupe_defaults(relays: list[ProviderRelay], target: ProviderRelay) -> list[ProviderRelay]:
    if not target.is_default:
        return relays
    updated = []
    for relay in relays:
        if relay.id == target.id:
            updated.append(target)
            continue
        if relay.service_type == target.service_type and relay.is_default:
            updated.append(ProviderRelay(**{**asdict(relay), "is_default": False}))
            continue
        updated.append(relay)
    return updated


def _credential_env_vars(provider: str) -> dict[str, list[str]]:
    provider_key = (provider or "").strip().lower()
    if provider_key == "openai":
        return {"api_key": ["OPENAI_API_KEY"]}
    if provider_key == "deepseek":
        return {"api_key": ["DEEPSEEK_API_KEY"]}
    if provider_key in {"doubao", "model_provider"}:
        return {"api_key": ["ARK_API_KEY"]}
    if provider_key in {"gemini", "google"}:
        return {"api_key": ["GEMINI_API_KEY", "GOOGLE_API_KEY"]}
    if provider_key in {"dashscope", "dashscope_tts", "qwen_tts"}:
        return {"api_key": ["DASHSCOPE_API_KEY"]}
    if provider_key == "vidu":
        return {"api_key": ["VIDU_API_KEY"]}
    if provider_key in {"kling", "klingai"}:
        return {
            "api_key": ["KLING_API_KEY"],
            "access_key": ["KLING_ACCESS_KEY", "KLING_ACCESSKEY"],
            "secret_key": ["KLING_SECRET_KEY", "KLING_SECRETKEY"],
        }
    if provider_key in {"jimeng", "jimeng_visual"}:
        return {
            "access_key": [
                "JIMENG_CV_ACCESS_KEY",
                "VOLC_ACCESSKEY",
                "VOLC_ACCESS_KEY",
                "VOLCENGINE_ACCESS_KEY",
            ],
            "secret_key": [
                "JIMENG_CV_SECRET_KEY",
                "VOLC_SECRETKEY",
                "VOLC_SECRET_KEY",
                "VOLCENGINE_SECRET_KEY",
            ],
        }
    return {}


def _resolve_builtin_credentials(credential_provider: str, config_dir: str | Path) -> dict[str, str | None]:
    creds = get_provider_credentials(credential_provider, config_dir)
    resolved = {
        "api_key": _normalize_api_key(creds.api_key),
        "access_key": _normalize_access_key(creds.app_id),
        "secret_key": _normalize_secret_key(creds.access_token),
    }
    for field, env_vars in _credential_env_vars(credential_provider).items():
        if resolved.get(field):
            continue
        normalizer = {
            "api_key": _normalize_api_key,
            "access_key": _normalize_access_key,
            "secret_key": _normalize_secret_key,
        }[field]
        for env_var in env_vars:
            env_value = normalizer(os.getenv(env_var))
            if env_value:
                resolved[field] = env_value
                break
    return resolved


def _builtin_relay_specs() -> list[dict[str, Any]]:
    return [
        {
            "id": "builtin:openai-text",
            "name": "系统默认 OpenAI 文本线路",
            "service_type": "text",
            "provider": "openai",
            "credential_provider": "openai",
            "base_url": os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1"),
            "model_patterns": ["gpt-*"],
            "priority": 9000,
        },
        {
            "id": "builtin:deepseek-text",
            "name": "系统默认 DeepSeek 文本线路",
            "service_type": "text",
            "provider": "openai",
            "credential_provider": "deepseek",
            "base_url": os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1"),
            "model_patterns": ["deepseek*"],
            "priority": 9010,
        },
        {
            "id": "builtin:doubao-any",
            "name": "系统默认 豆包线路",
            "service_type": "any",
            "provider": "doubao",
            "credential_provider": "doubao",
            "base_url": "https://ark.cn-beijing.volces.com/api/v3",
            "model_patterns": ["doubao*"],
            "priority": 9020,
        },
        {
            "id": "builtin:12api-gemini",
            "name": "系统默认 12API Gemini 线路",
            "service_type": "any",
            "provider": "12api",
            "credential_provider": "gemini",
            "base_url": os.getenv("GEMINI_API_BASE") or os.getenv("GEMINI_API_BASE_URL") or "https://new.12ai.org/v1beta",
            "model_patterns": ["gemini*"],
            "priority": 9030,
        },
        {
            "id": "builtin:12api-veo",
            "name": "系统默认 12API Veo 线路",
            "service_type": "video",
            "provider": "12api",
            "credential_provider": "gemini",
            "base_url": os.getenv("VEO_API_BASE", "https://new.12ai.org"),
            "model_patterns": ["veo-*"],
            "priority": 9040,
        },
        {
            "id": "builtin:12api-sora",
            "name": "系统默认 12API Sora 线路",
            "service_type": "video",
            "provider": "12api",
            "credential_provider": "openai",
            "base_url": os.getenv("SORA_API_BASE", "https://cdn.12ai.org"),
            "model_patterns": ["sora*"],
            "priority": 9050,
        },
        {
            "id": "builtin:dashscope-image-video",
            "name": "系统默认 阿里百炼图像/视频线路",
            "service_type": "any",
            "provider": "dashscope",
            "credential_provider": "dashscope",
            "base_url": None,
            "model_patterns": ["wan2.*", "wanx*", "qwen-image-edit*"],
            "priority": 9060,
        },
        {
            "id": "builtin:qwen-audio",
            "name": "系统默认 通义语音线路",
            "service_type": "audio",
            "provider": "qwen",
            "credential_provider": "dashscope",
            "base_url": None,
            "model_patterns": ["qwen3-tts*"],
            "priority": 9070,
        },
        {
            "id": "builtin:vidu-video",
            "name": "系统默认 Vidu 视频线路",
            "service_type": "video",
            "provider": "vidu",
            "credential_provider": "vidu",
            "base_url": os.getenv("VIDU_API_BASE", "https://api.vidu.cn"),
            "model_patterns": ["vidu*"],
            "priority": 9080,
        },
        {
            "id": "builtin:kling-any",
            "name": "系统默认 可灵线路",
            "service_type": "any",
            "provider": "kling",
            "credential_provider": "kling",
            "base_url": os.getenv("KLING_API_BASE", "https://api-beijing.klingai.com"),
            "model_patterns": ["kling*"],
            "priority": 9090,
        },
        {
            "id": "builtin:jimeng-image",
            "name": "系统默认 Jimeng 图像线路",
            "service_type": "image",
            "provider": "jimeng",
            "credential_provider": "jimeng_visual",
            "base_url": os.getenv("JIMENG_VISUAL_API_BASE", "https://visual.volcengineapi.com"),
            "model_patterns": ["jimeng*"],
            "priority": 9100,
            "editable_fields": ["access_key", "secret_key"],
        },
    ]


def _build_builtin_relays(config_dir: str | Path) -> list[ProviderRelay]:
    builtins: list[ProviderRelay] = []
    for spec in _builtin_relay_specs():
        resolved_credentials = _resolve_builtin_credentials(spec["credential_provider"], config_dir)
        stored_credentials = get_provider_credentials(spec["credential_provider"], config_dir)
        builtins.append(
            ProviderRelay(
                id=spec["id"],
                name=spec["name"],
                service_type=spec["service_type"],
                provider=spec["provider"],
                base_url=spec["base_url"],
                api_key=resolved_credentials["api_key"],
                access_key=resolved_credentials["access_key"],
                secret_key=resolved_credentials["secret_key"],
                model_patterns=spec["model_patterns"],
                priority=spec["priority"],
                enabled=True,
                is_default=True,
                created_at=None,
                updated_at=stored_credentials.updated_at,
                managed_via="provider_credentials",
                system_default=True,
                credential_provider=spec["credential_provider"],
                deletable=False,
                reorderable=False,
                editable_fields=spec.get("editable_fields", ["api_key"]),
            )
        )
    return builtins


def _find_builtin_relay(relay_id: str, config_dir: str | Path) -> ProviderRelay | None:
    for relay in _build_builtin_relays(config_dir):
        if relay.id == relay_id:
            return relay
    return None


def list_provider_relays(config_dir: str | Path, *, include_secrets: bool = False) -> list[ProviderRelay]:
    path = _config_path(config_dir)
    relays = []
    for item in _load_all(path):
        relay = _coerce_relay(item)
        if relay is not None:
            relays.append(relay)
    relays = _sort_relays(relays)
    if include_secrets:
        return relays
    return [
        ProviderRelay(
            **{
                **asdict(relay),
                "api_key": None,
                "access_key": None,
                "secret_key": None,
            }
        )
        for relay in relays
    ]


def list_provider_relays_for_admin(
    config_dir: str | Path,
    *,
    include_secrets: bool = False,
) -> list[ProviderRelay]:
    custom_relays = list_provider_relays(config_dir, include_secrets=include_secrets)
    builtin_relays = _build_builtin_relays(config_dir)
    if not include_secrets:
        builtin_relays = [
            ProviderRelay(
                **{
                **asdict(relay),
                "api_key": None,
                "access_key": None,
                "secret_key": None,
            }
        )
            for relay in builtin_relays
        ]
    return [*custom_relays, *builtin_relays]


def create_provider_relay(payload: dict[str, Any], config_dir: str | Path) -> ProviderRelay:
    path = _config_path(config_dir)
    relays = list_provider_relays(config_dir, include_secrets=True)
    normalized = _validate_relay_payload(payload, is_create=True)
    now = datetime.now(tz=timezone.utc).isoformat()
    relay = ProviderRelay(
        id=str(uuid4()),
        name=normalized["name"],
        service_type=normalized.get("service_type", "any"),
        provider=normalized["provider"],
        base_url=normalized.get("base_url"),
        api_key=normalized.get("api_key"),
        access_key=normalized.get("access_key"),
        secret_key=normalized.get("secret_key"),
        model_patterns=normalized.get("model_patterns", []),
        priority=normalized.get("priority", (len(relays) + 1) * 10),
        enabled=normalized.get("enabled", True),
        is_default=normalized.get("is_default", False),
        created_at=now,
        updated_at=now,
    )
    relays.append(relay)
    relays = _dedupe_defaults(relays, relay)
    relays = _sort_relays(relays)
    _save_all(path, [_serialize_relay(item, include_secrets=True) for item in relays])
    return next(item for item in relays if item.id == relay.id)


def update_provider_relay(relay_id: str, payload: dict[str, Any], config_dir: str | Path) -> ProviderRelay:
    builtin_relay = _find_builtin_relay(relay_id, config_dir)
    if builtin_relay is not None:
        credential_provider = builtin_relay.credential_provider
        if not credential_provider:
            raise ValueError("built-in relay is missing credential provider")
        save_provider_credentials(
            provider=credential_provider,
            payload={
                "api_key": payload.get("api_key"),
                "app_id": payload.get("access_key"),
                "access_token": payload.get("secret_key"),
            },
            config_dir=config_dir,
        )
        refreshed = _find_builtin_relay(relay_id, config_dir)
        if refreshed is None:
            raise KeyError(relay_id)
        return refreshed

    path = _config_path(config_dir)
    relays = list_provider_relays(config_dir, include_secrets=True)
    normalized = _validate_relay_payload(payload, is_create=False)

    updated_relay: ProviderRelay | None = None
    for index, relay in enumerate(relays):
        if relay.id != relay_id:
            continue
        merged = asdict(relay)
        merged.update(normalized)
        merged["updated_at"] = datetime.now(tz=timezone.utc).isoformat()
        updated = _coerce_relay(merged)
        if updated is None:
            raise ValueError("relay payload is invalid after update")
        relays[index] = updated
        updated_relay = updated
        break

    if updated_relay is None:
        raise KeyError(relay_id)

    relays = _dedupe_defaults(relays, updated_relay)
    relays = _sort_relays(relays)
    _save_all(path, [_serialize_relay(item, include_secrets=True) for item in relays])
    return next(item for item in relays if item.id == relay_id)


def reorder_provider_relays(relay_ids: list[str], config_dir: str | Path) -> list[ProviderRelay]:
    path = _config_path(config_dir)
    relays = list_provider_relays(config_dir, include_secrets=True)
    if not relay_ids:
        raise ValueError("relay_ids must not be empty")

    relay_map = {relay.id: relay for relay in relays}
    if set(relay_ids) != set(relay_map.keys()):
        raise ValueError("relay_ids must include all relay ids exactly once")

    reordered = []
    now = datetime.now(tz=timezone.utc).isoformat()
    for index, relay_id in enumerate(relay_ids):
        relay = relay_map[relay_id]
        reordered.append(
            ProviderRelay(
                **{
                    **asdict(relay),
                    "priority": (index + 1) * 10,
                    "updated_at": now,
                }
            )
        )

    reordered = _sort_relays(reordered)
    _save_all(path, [_serialize_relay(item, include_secrets=True) for item in reordered])
    return reordered


def delete_provider_relay(relay_id: str, config_dir: str | Path) -> bool:
    if relay_id.startswith("builtin:"):
        return False
    path = _config_path(config_dir)
    relays = list_provider_relays(config_dir, include_secrets=True)
    kept = [relay for relay in relays if relay.id != relay_id]
    if len(kept) == len(relays):
        return False
    kept = _sort_relays(kept)
    _save_all(path, [_serialize_relay(item, include_secrets=True) for item in kept])
    return True


def get_matching_provider_relay(model: str, config_dir: str | Path, *, service_type: str = "any") -> ProviderRelay | None:
    model_key = (model or "").strip().lower()
    if not model_key:
        return None

    service_key = _normalize_service_type(service_type)
    relays = [
        relay
        for relay in list_provider_relays_for_admin(config_dir, include_secrets=True)
        if relay.enabled
        and (relay.api_key or (relay.access_key and relay.secret_key))
        and (relay.service_type == "any" or relay.service_type == service_key)
    ]

    if not relays:
        return None

    relays = sorted(relays, key=lambda relay: (relay.service_type != service_key, relay.priority))
    for relay in relays:
        for pattern in relay.model_patterns:
            normalized_pattern = pattern.strip().lower()
            if normalized_pattern and fnmatchcase(model_key, normalized_pattern):
                return relay

    exact_defaults = [relay for relay in relays if relay.service_type == service_key and relay.is_default]
    if exact_defaults:
        return exact_defaults[0]

    any_defaults = [relay for relay in relays if relay.service_type == "any" and relay.is_default]
    if any_defaults:
        return any_defaults[0]

    return None


def serialize_provider_relay_for_response(relay: ProviderRelay) -> dict[str, Any]:
    payload = asdict(relay)
    payload["api_key_present"] = bool(relay.api_key)
    payload["api_key_masked"] = mask_secret(relay.api_key)
    payload["access_key_present"] = bool(relay.access_key)
    payload["access_key_masked"] = mask_secret(relay.access_key)
    payload["secret_key_present"] = bool(relay.secret_key)
    payload["secret_key_masked"] = mask_secret(relay.secret_key)
    payload.pop("api_key", None)
    payload.pop("access_key", None)
    payload.pop("secret_key", None)
    return payload
