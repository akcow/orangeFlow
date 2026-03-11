from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from urllib.parse import quote

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
        "api/v1/files/public-inline/",
        "api/v1/files/public/",
        "/api/v1/files/images/",
        "/api/v1/files/media/",
        "/api/v1/files/download/",
        "/api/v1/files/public-inline/",
        "/api/v1/files/public/",
        "files/images/",
        "files/media/",
        "files/download/",
        "files/public-inline/",
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
    return parts[0], "/".join(parts[1:])


def _resolve_storage_urls(
    file_path: str,
    *,
    kind: str | None = None,
    ttl_seconds: int = 3600,
) -> tuple[str | None, str | None]:
    parsed = parse_flow_file_path(file_path)
    if not parsed:
        return None, None
    flow_id, file_name = parsed
    try:  # pragma: no cover - runtime dependency
        from langflow.services.deps import get_storage_service

        storage_service = get_storage_service()
        inline_url = storage_service.build_inline_url(flow_id, file_name, kind=kind)
        public_url = storage_service.build_public_url(flow_id, file_name, ttl_seconds=ttl_seconds)
        return inline_url, public_url
    except Exception:
        return None, None


def stable_in_app_file_url(file_path: str, *, kind: str) -> str | None:
    storage_inline_url, _ = _resolve_storage_urls(file_path, kind=kind)
    if storage_inline_url:
        return storage_inline_url
    parsed = parse_flow_file_path(file_path)
    if not parsed:
        return None
    flow_id, file_name = parsed
    safe_file_name = quote(file_name, safe="/")
    if kind == "image":
        return f"/api/v1/files/images/{flow_id}/{safe_file_name}"
    if kind in ("video", "audio"):
        return f"/api/v1/files/media/{flow_id}/{safe_file_name}"
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
        return explicit.rstrip("/")

    explicit = str(os.getenv("LANGFLOW_BACKEND_URL", "") or os.getenv("BACKEND_URL", "") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    try:  # pragma: no cover - runtime dependency
        from langflow.services.deps import get_settings_service

        settings_service = get_settings_service()
        explicit = str(getattr(settings_service.settings, "public_base_url", "") or "").strip()
        if explicit:
            return explicit.rstrip("/")
        explicit = str(getattr(settings_service.settings, "backend_url", "") or "").strip()
        if explicit:
            return explicit.rstrip("/")
        host = str(settings_service.settings.host or "localhost")
        port = int(
            getattr(settings_service.settings, "runtime_port", None)
            or getattr(settings_service.settings, "port", 7860)
            or 7860
        )
        # Prefer explicit URL if provided.
        if str(host).startswith(("http://", "https://")):
            return str(host).rstrip("/")
        scheme = "https" if bool(getattr(settings_service.settings, "ssl_cert_file", None)) else "http"
        # Don't include default ports.
        if (scheme == "http" and port == 80) or (scheme == "https" and port == 443):
            return f"{scheme}://{host}"
        return f"{scheme}://{host}:{port}"
    except Exception:
        return ""


def build_public_file_url(file_path: str, *, ttl_seconds: int = 3600) -> str | None:
    _, storage_public_url = _resolve_storage_urls(file_path, ttl_seconds=ttl_seconds)
    if storage_public_url:
        return storage_public_url
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
    safe_file_name = quote(file_name, safe="/")
    return f"{base}/api/v1/files/public-inline/{flow_id}/{safe_file_name}?token={token.value}"


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
