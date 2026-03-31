from __future__ import annotations

import json
import os
import re


def _strip_secret(value: str | None) -> str | None:
    if value is None:
        return None
    secret = str(value).strip().strip("'").strip('"')
    if not secret or secret.startswith("****"):
        return None
    return secret


def _normalize_secret(value: str | None) -> str | None:
    secret = _strip_secret(value)
    if not secret:
        return None
    secret = "".join(secret.split())
    return secret or None


def extract_jimeng_access_secret_pair(raw_value: str | None) -> tuple[str, str] | None:
    raw = _strip_secret(raw_value)
    if not raw:
        return None

    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    if text.startswith("{") and text.endswith("}"):
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, dict):
            access_key = _normalize_secret(
                payload.get("access_key") or payload.get("accessKey") or payload.get("ak")
            )
            secret_key = _normalize_secret(
                payload.get("secret_key") or payload.get("secretKey") or payload.get("sk")
            )
            if access_key and secret_key:
                return access_key, secret_key

    fields: dict[str, str] = {}
    matched = False
    for line in text.split("\n"):
        item = line.strip().strip(",")
        if not item:
            continue
        match = re.match(r"(?i)^(access[_\s-]*key|ak|secret[_\s-]*key|sk)\s*[:=]\s*(.+)$", item)
        if not match:
            continue
        matched = True
        key_name = match.group(1).lower().replace(" ", "").replace("-", "").replace("_", "")
        value = _normalize_secret(match.group(2))
        if not value:
            continue
        if key_name in {"accesskey", "ak"}:
            fields["access_key"] = value
        elif key_name in {"secretkey", "sk"}:
            fields["secret_key"] = value

    if matched and fields.get("access_key") and fields.get("secret_key"):
        return fields["access_key"], fields["secret_key"]

    return None


def _load_provider_credentials_pair(*, providers: list[str]) -> tuple[str, str] | None:
    try:  # pragma: no cover - runtime dependency
        from langflow.services.deps import get_settings_service
        from lfx.utils.provider_credentials import get_provider_credentials

        settings_service = get_settings_service()
        config_dir = settings_service.settings.config_dir
        for provider in providers:
            creds = get_provider_credentials(provider, config_dir)
            pair = extract_jimeng_access_secret_pair(creds.api_key)
            if pair:
                return pair

            access_key = _normalize_secret(creds.app_id)
            secret_key = _normalize_secret(creds.access_token)
            if access_key and secret_key:
                return access_key, secret_key
    except Exception:
        return None
    return None


def resolve_jimeng_access_secret_pair(*, providers: list[str] | None = None) -> tuple[str, str] | None:
    provider_names = providers or ["jimeng_visual", "jimeng"]

    access_key = _normalize_secret(
        os.getenv("JIMENG_CV_ACCESS_KEY")
        or os.getenv("VOLC_ACCESSKEY")
        or os.getenv("VOLC_ACCESS_KEY")
        or os.getenv("VOLCENGINE_ACCESS_KEY")
    )
    secret_key = _normalize_secret(
        os.getenv("JIMENG_CV_SECRET_KEY")
        or os.getenv("VOLC_SECRETKEY")
        or os.getenv("VOLC_SECRET_KEY")
        or os.getenv("VOLCENGINE_SECRET_KEY")
    )
    if access_key and secret_key:
        return access_key, secret_key

    return _load_provider_credentials_pair(providers=provider_names)
