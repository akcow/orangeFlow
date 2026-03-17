from __future__ import annotations

import json
import os
import re
import time

from jose import jwt


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
    if secret.lower().startswith("bearer "):
        secret = secret.split(" ", 1)[1].strip()
    secret = "".join(secret.split())
    return secret or None


def _extract_access_secret_pair(raw_value: str | None) -> tuple[str, str] | None:
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


def build_kling_bearer_token(*, access_key: str, secret_key: str, now_ts: int | None = None) -> str:
    issued_at = int(time.time() if now_ts is None else now_ts)
    payload = {
        "iss": str(access_key),
        "exp": issued_at + 1800,
        "nbf": issued_at - 5,
    }
    headers = {"alg": "HS256", "typ": "JWT"}
    token = jwt.encode(payload, str(secret_key), algorithm="HS256", headers=headers)
    return str(token)


def build_kling_bearer_token_from_value(value: str | None, *, now_ts: int | None = None) -> str | None:
    pair = _extract_access_secret_pair(value)
    if pair:
        access_key, secret_key = pair
        return build_kling_bearer_token(access_key=access_key, secret_key=secret_key, now_ts=now_ts)
    return _normalize_secret(value)


def _load_provider_credentials_token(*, providers: list[str]) -> str | None:
    try:  # pragma: no cover - runtime dependency
        from langflow.services.deps import get_settings_service
        from lfx.utils.provider_credentials import get_provider_credentials

        settings_service = get_settings_service()
        config_dir = settings_service.settings.config_dir
        for provider in providers:
            creds = get_provider_credentials(provider, config_dir)
            token = build_kling_bearer_token_from_value(creds.api_key)
            if token:
                return token

            access_key = _normalize_secret(creds.app_id)
            secret_key = _normalize_secret(creds.access_token)
            if access_key and secret_key:
                return build_kling_bearer_token(access_key=access_key, secret_key=secret_key)
    except Exception:
        return None
    return None


def resolve_kling_bearer_token(*, providers: list[str] | None = None) -> str | None:
    provider_names = providers or ["kling", "klingai"]

    token = build_kling_bearer_token_from_value(os.getenv("KLING_API_KEY"))
    if token:
        return token

    access_key = _normalize_secret(os.getenv("KLING_ACCESS_KEY") or os.getenv("KLING_ACCESSKEY"))
    secret_key = _normalize_secret(os.getenv("KLING_SECRET_KEY") or os.getenv("KLING_SECRETKEY"))
    if access_key and secret_key:
        return build_kling_bearer_token(access_key=access_key, secret_key=secret_key)

    return _load_provider_credentials_token(providers=provider_names)
