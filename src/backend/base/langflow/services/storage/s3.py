from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import quote

import anyio
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, NoCredentialsError
from lfx.log.logger import logger

from .service import StorageService


class S3StorageService(StorageService):
    """S3-compatible object storage for AWS S3, MinIO, and similar providers."""

    def __init__(self, session_service, settings_service) -> None:
        super().__init__(session_service, settings_service)
        settings = settings_service.settings
        bucket = str(settings.s3_bucket_name or "").strip()
        if not bucket:
            raise ValueError("storage_type=s3 requires LANGFLOW_S3_BUCKET_NAME to be configured.")

        self.bucket = bucket
        self.root_prefix = str(settings.s3_root_prefix or "").strip().strip("/")
        self.public_base_url = str(settings.s3_public_base_url or "").strip().rstrip("/")
        self.presign_expiration = int(getattr(settings, "s3_presign_expiration", 3600) or 3600)
        self.cache_dir = anyio.Path(Path(str(self.data_dir)) / ".storage_cache" / "s3")

        client_kwargs: dict = {
            "config": Config(
                signature_version="s3v4",
                s3={"addressing_style": str(settings.s3_addressing_style or "path").strip().lower() or "path"},
            ),
            "use_ssl": bool(getattr(settings, "s3_use_ssl", True)),
            "verify": bool(getattr(settings, "s3_verify_ssl", True)),
        }
        if settings.s3_region:
            client_kwargs["region_name"] = settings.s3_region
        if settings.s3_endpoint_url:
            client_kwargs["endpoint_url"] = settings.s3_endpoint_url
        if settings.s3_access_key_id:
            client_kwargs["aws_access_key_id"] = settings.s3_access_key_id
        if settings.s3_secret_access_key:
            client_kwargs["aws_secret_access_key"] = settings.s3_secret_access_key
        if settings.s3_session_token:
            client_kwargs["aws_session_token"] = settings.s3_session_token

        self.s3_client = boto3.client("s3", **client_kwargs)
        self.set_ready()

    def build_object_key(self, flow_id: str, file_name: str) -> str:
        suffix = super().build_object_key(flow_id, file_name)
        return f"{self.root_prefix}/{suffix}" if self.root_prefix else suffix

    def _cache_path(self, flow_id: str, file_name: str) -> Path:
        safe_relative = Path(*[part for part in file_name.replace("\\", "/").split("/") if part])
        return Path(str(self.cache_dir)) / flow_id / safe_relative

    def build_full_path(self, flow_id: str, file_name: str) -> str:
        cache_path = self._cache_path(flow_id, file_name)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        if cache_path.exists():
            return str(cache_path)

        key = self.build_object_key(flow_id, file_name)
        try:
            self.s3_client.download_file(self.bucket, key, str(cache_path))
            return str(cache_path)
        except ClientError:
            logger.exception("Error downloading file %s from bucket %s", key, self.bucket)
            raise

    def build_inline_url(self, flow_id: str, file_name: str, *, kind: str | None = None) -> str | None:
        if self.public_base_url:
            return self.build_public_url(flow_id, file_name, ttl_seconds=self.presign_expiration)

        proxy_url = self._build_signed_proxy_url(
            "/api/v1/files/public-inline",
            flow_id,
            file_name,
            ttl_seconds=self.presign_expiration,
        )
        if proxy_url:
            return proxy_url
        return self.build_public_url(flow_id, file_name, ttl_seconds=self.presign_expiration)

    def build_public_url(self, flow_id: str, file_name: str, *, ttl_seconds: int = 3600) -> str | None:
        key = self.build_object_key(flow_id, file_name)
        if self.public_base_url:
            return f"{self.public_base_url}/{quote(key, safe='/')}"

        proxy_url = self._build_signed_proxy_url(
            "/api/v1/files/public-inline",
            flow_id,
            file_name,
            ttl_seconds=ttl_seconds,
        )
        if proxy_url:
            return proxy_url

        expires_in = int(ttl_seconds or self.presign_expiration or 3600)
        try:
            return self.s3_client.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=expires_in,
            )
        except ClientError:
            logger.exception("Error generating presigned URL for %s", key)
            return None

    async def save_file(self, flow_id: str, file_name: str, data: bytes) -> None:
        key = self.build_object_key(flow_id, file_name)
        put_kwargs = {"Bucket": self.bucket, "Key": key, "Body": data}
        content_type = mimetypes.guess_type(file_name)[0]
        if content_type:
            put_kwargs["ContentType"] = content_type

        try:
            self.s3_client.put_object(**put_kwargs)
            cache_path = self._cache_path(flow_id, file_name)
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_bytes(data)
            await logger.ainfo(f"File {file_name} saved successfully in bucket {self.bucket} at key {key}.")
        except NoCredentialsError:
            await logger.aexception("Credentials not available for S3 storage.")
            raise
        except ClientError:
            await logger.aexception(f"Error saving file {file_name} in bucket {self.bucket}")
            raise

    async def get_file(self, flow_id: str, file_name: str) -> bytes:
        key = self.build_object_key(flow_id, file_name)
        try:
            response = self.s3_client.get_object(Bucket=self.bucket, Key=key)
            data = response["Body"].read()
            cache_path = self._cache_path(flow_id, file_name)
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_bytes(data)
            await logger.ainfo(f"File {file_name} retrieved successfully from bucket {self.bucket}.")
            return data
        except ClientError:
            await logger.aexception(f"Error retrieving file {file_name} from bucket {self.bucket}")
            raise

    async def list_files(self, flow_id: str) -> list[str]:
        prefix = self.build_object_key(flow_id, "")
        paginator = self.s3_client.get_paginator("list_objects_v2")
        try:
            pages = paginator.paginate(Bucket=self.bucket, Prefix=prefix)
            files: list[str] = []
            prefix_with_slash = prefix.rstrip("/") + "/"
            for page in pages:
                for item in page.get("Contents", []):
                    key = str(item.get("Key") or "")
                    if not key or key.endswith("/"):
                        continue
                    if not key.startswith(prefix_with_slash):
                        continue
                    files.append(key[len(prefix_with_slash) :])
            await logger.ainfo(f"Listed {len(files)} files in bucket {self.bucket} under {prefix}.")
            return files
        except ClientError:
            await logger.aexception(f"Error listing files for prefix {prefix}")
            raise

    async def delete_file(self, flow_id: str, file_name: str) -> None:
        key = self.build_object_key(flow_id, file_name)
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=key)
            cache_path = self._cache_path(flow_id, file_name)
            if cache_path.exists():
                cache_path.unlink()
            await logger.ainfo(f"File {file_name} deleted successfully from bucket {self.bucket}.")
        except ClientError:
            await logger.aexception(f"Error deleting file {file_name} from bucket {self.bucket}")
            raise

    async def get_file_size(self, flow_id: str, file_name: str) -> int:
        key = self.build_object_key(flow_id, file_name)
        try:
            response = self.s3_client.head_object(Bucket=self.bucket, Key=key)
            return int(response["ContentLength"])
        except ClientError:
            await logger.aexception(f"Error getting size for file {file_name} from bucket {self.bucket}")
            raise

    async def teardown(self) -> None:
        return None
