from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from lfx.utils.public_files import generate_public_file_token


def parse_flow_file_path(value: str | None) -> tuple[str, str] | None:
    """Parse the StorageService-style file path: '{flow_id}/{file_name}'.

    Frontend upload endpoint (/api/v1/files/upload/{flow_id}) returns 'file_path' in this format.
    """
    if not value:
        return None
    raw = str(value).strip().replace("\\", "/").lstrip("/")
    if not raw:
        return None

    # Strip known API prefixes if present.
    for prefix in (
        "api/v1/files/images/",
        "api/v1/files/media/",
        "api/v1/files/download/",
        "api/v1/files/public/",
        "/api/v1/files/images/",
        "/api/v1/files/media/",
        "/api/v1/files/download/",
        "/api/v1/files/public/",
        "files/images/",
        "files/media/",
        "files/download/",
        "files/public/",
    ):
        if raw.startswith(prefix):
            raw = raw[len(prefix) :]
            break

    # Drop query string (public token URLs).
    raw = raw.split("?", 1)[0]
    parts = [p for p in raw.split("/") if p]
    if len(parts) < 2:
        return None
    return parts[0], parts[-1]


def stable_in_app_file_url(file_path: str, *, kind: str) -> str | None:
    parsed = parse_flow_file_path(file_path)
    if not parsed:
        return None
    flow_id, file_name = parsed
    if kind == "image":
        return f"/api/v1/files/images/{flow_id}/{file_name}"
    if kind in ("video", "audio"):
        return f"/api/v1/files/media/{flow_id}/{file_name}"
    return None


def resolve_secret_key() -> str:
    try:  # pragma: no cover - runtime dependency
        from langflow.services.deps import get_settings_service

        settings_service = get_settings_service()
        return str(settings_service.auth_settings.SECRET_KEY.get_secret_value() or "")
    except Exception:
        return str(os.getenv("LANGFLOW_SECRET_KEY", "") or "")


def resolve_public_base_url() -> str:
    explicit = str(os.getenv("LANGFLOW_PUBLIC_BASE_URL", "") or "").strip()
    if explicit:
        return explicit
    try:  # pragma: no cover - runtime dependency
        from langflow.services.deps import get_settings_service

        settings_service = get_settings_service()
        host = str(settings_service.settings.host or "localhost")
        port = int(getattr(settings_service.settings, "port", 7860) or 7860)
        # Prefer explicit URL if provided.
        if str(host).startswith(("http://", "https://")):
            return str(host).rstrip("/")
        scheme = "https" if bool(getattr(settings_service.settings, "https", False)) else "http"
        # Don't include default ports.
        if (scheme == "http" and port == 80) or (scheme == "https" and port == 443):
            return f"{scheme}://{host}"
        return f"{scheme}://{host}:{port}"
    except Exception:
        return ""


def build_public_file_url(file_path: str, *, ttl_seconds: int = 3600) -> str | None:
    parsed = parse_flow_file_path(file_path)
    if not parsed:
        return None
    flow_id, file_name = parsed
    secret_key = resolve_secret_key()
    if not secret_key:
        return None
    base = resolve_public_base_url().rstrip("/")
    if not base:
        return None
    token = generate_public_file_token(
        secret_key=secret_key,
        flow_id=flow_id,
        file_name=file_name,
        ttl_seconds=ttl_seconds,
    )
    return f"{base}/api/v1/files/public/{flow_id}/{file_name}?token={token.value}"


def extract_file_path(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, (list, tuple)):
        for item in value:
            candidate = extract_file_path(item)
            if candidate:
                return candidate
        return None
    if isinstance(value, dict):
        candidate = value.get("file_path") or value.get("path") or value.get("value")
        resolved = extract_file_path(candidate)
        if resolved:
            return resolved
        return None
    return str(value).strip() or None


def infer_extension(file_name: str | None) -> str | None:
    if not file_name:
        return None
    ext = Path(str(file_name)).suffix.lower().lstrip(".")
    return ext or None
