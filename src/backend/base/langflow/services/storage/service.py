from __future__ import annotations

from abc import abstractmethod
from urllib.parse import quote
from typing import TYPE_CHECKING

import anyio
from lfx.utils.public_files import generate_public_file_token

from langflow.services.base import Service

if TYPE_CHECKING:
    from lfx.services.settings.service import SettingsService

    from langflow.services.session.service import SessionService


class StorageService(Service):
    name = "storage_service"

    def __init__(self, session_service: SessionService, settings_service: SettingsService):
        self.settings_service = settings_service
        self.session_service = session_service
        self.data_dir: anyio.Path = anyio.Path(settings_service.settings.config_dir)
        self.set_ready()

    def build_full_path(self, flow_id: str, file_name: str) -> str:
        raise NotImplementedError

    def build_object_key(self, flow_id: str, file_name: str) -> str:
        raw = f"{flow_id}/{file_name}".replace("\\", "/").lstrip("/")
        return "/".join(part for part in raw.split("/") if part)

    def build_inline_url(self, flow_id: str, file_name: str, *, kind: str | None = None) -> str | None:
        return None

    def build_public_url(self, flow_id: str, file_name: str, *, ttl_seconds: int = 3600) -> str | None:
        return None

    def _resolve_secret_key(self) -> str:
        try:
            return str(self.settings_service.auth_settings.SECRET_KEY.get_secret_value() or "")
        except Exception:
            return ""

    def _resolve_public_base_url(self) -> str:
        explicit = str(getattr(self.settings_service.settings, "public_base_url", "") or "").strip()
        if explicit:
            return explicit.rstrip("/")

        explicit = str(getattr(self.settings_service.settings, "backend_url", "") or "").strip()
        if explicit:
            return explicit.rstrip("/")

        try:
            host = str(self.settings_service.settings.host or "localhost")
            port = int(getattr(self.settings_service.settings, "runtime_port", None) or self.settings_service.settings.port or 7860)
            if host.startswith(("http://", "https://")):
                return host.rstrip("/")
            scheme = "https" if bool(getattr(self.settings_service.settings, "ssl_cert_file", None)) else "http"
            if (scheme == "http" and port == 80) or (scheme == "https" and port == 443):
                return f"{scheme}://{host}"
            return f"{scheme}://{host}:{port}"
        except Exception:
            return ""

    def _build_signed_proxy_url(self, route_prefix: str, flow_id: str, file_name: str, *, ttl_seconds: int = 3600) -> str | None:
        secret_key = self._resolve_secret_key()
        if not secret_key:
            return None
        base = self._resolve_public_base_url()
        if not base:
            return None
        token = generate_public_file_token(
            secret_key=secret_key,
            flow_id=flow_id,
            file_name=file_name,
            ttl_seconds=ttl_seconds,
        )
        safe_name = quote(file_name, safe="/")
        return f"{base.rstrip('/')}{route_prefix}/{flow_id}/{safe_name}?token={token.value}"

    def set_ready(self) -> None:
        self.ready = True

    @abstractmethod
    async def save_file(self, flow_id: str, file_name: str, data) -> None:
        raise NotImplementedError

    @abstractmethod
    async def get_file(self, flow_id: str, file_name: str) -> bytes:
        raise NotImplementedError

    @abstractmethod
    async def list_files(self, flow_id: str) -> list[str]:
        raise NotImplementedError

    @abstractmethod
    async def get_file_size(self, flow_id: str, file_name: str):
        raise NotImplementedError

    @abstractmethod
    async def delete_file(self, flow_id: str, file_name: str) -> None:
        raise NotImplementedError

    async def teardown(self) -> None:
        raise NotImplementedError
