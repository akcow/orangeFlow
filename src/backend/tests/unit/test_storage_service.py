from __future__ import annotations

import io
from pathlib import Path
from types import SimpleNamespace

import pytest

from langflow.services.storage.s3 import S3StorageService


class _DummySecret:
    def __init__(self, value: str):
        self._value = value

    def get_secret_value(self) -> str:
        return self._value


class _FakePaginator:
    def __init__(self, store: dict[str, bytes]):
        self.store = store

    def paginate(self, *, Bucket: str, Prefix: str):
        del Bucket
        yield {
            "Contents": [
                {"Key": key}
                for key in self.store
                if key.startswith(Prefix.rstrip("/") + "/")
            ]
        }


class _FakeS3Client:
    def __init__(self):
        self.store: dict[str, bytes] = {}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, **kwargs):
        del Bucket, kwargs
        self.store[Key] = bytes(Body)

    def get_object(self, *, Bucket: str, Key: str):
        del Bucket
        return {"Body": io.BytesIO(self.store[Key])}

    def download_file(self, bucket: str, key: str, filename: str):
        del bucket
        Path(filename).write_bytes(self.store[key])

    def generate_presigned_url(self, ClientMethod: str, Params: dict, ExpiresIn: int):
        assert ClientMethod == "get_object"
        return f"https://signed.example/{Params['Bucket']}/{Params['Key']}?expires={ExpiresIn}"

    def head_object(self, *, Bucket: str, Key: str):
        del Bucket
        return {"ContentLength": len(self.store[Key])}

    def get_paginator(self, name: str):
        assert name == "list_objects_v2"
        return _FakePaginator(self.store)

    def delete_object(self, *, Bucket: str, Key: str):
        del Bucket
        self.store.pop(Key, None)


def _settings_service(tmp_path, **overrides):
    settings = SimpleNamespace(
        config_dir=str(tmp_path),
        s3_bucket_name="langflow-media",
        s3_region="us-east-1",
        s3_endpoint_url="http://127.0.0.1:9000",
        s3_access_key_id="minioadmin",
        s3_secret_access_key="minioadmin",
        s3_session_token=None,
        s3_root_prefix="prod",
        s3_public_base_url=None,
        s3_presign_expiration=900,
        s3_addressing_style="path",
        s3_use_ssl=False,
        s3_verify_ssl=False,
        host="localhost",
        port=7860,
        runtime_port=None,
        ssl_cert_file=None,
        public_base_url="http://localhost:7860",
        backend_url="",
    )
    for key, value in overrides.items():
        setattr(settings, key, value)
    return SimpleNamespace(
        settings=settings,
        auth_settings=SimpleNamespace(SECRET_KEY=_DummySecret("secret-key")),
    )


@pytest.mark.asyncio
async def test_s3_storage_service_supports_signed_proxy_urls_and_local_cache(monkeypatch, tmp_path):
    fake_client = _FakeS3Client()
    monkeypatch.setattr("langflow.services.storage.s3.boto3.client", lambda *args, **kwargs: fake_client)

    service = S3StorageService(SimpleNamespace(), _settings_service(tmp_path))

    await service.save_file("flow-1", "images/output.png", b"binary-image")

    assert fake_client.store["prod/flow-1/images/output.png"] == b"binary-image"
    public_url = service.build_public_url("flow-1", "images/output.png", ttl_seconds=123)
    assert public_url is not None
    assert public_url.startswith(
        "http://localhost:7860/api/v1/files/public-inline/flow-1/images/output.png?token="
    )
    assert service.build_inline_url("flow-1", "images/output.png", kind="image").startswith(
        "http://localhost:7860/api/v1/files/public-inline/flow-1/images/output.png?token="
    )

    cached_path = Path(service.build_full_path("flow-1", "images/output.png"))
    assert cached_path.exists()
    assert cached_path.read_bytes() == b"binary-image"

    assert await service.get_file_size("flow-1", "images/output.png") == len(b"binary-image")
    assert await service.list_files("flow-1") == ["images/output.png"]


@pytest.mark.asyncio
async def test_s3_storage_service_can_emit_direct_public_base_urls(monkeypatch, tmp_path):
    fake_client = _FakeS3Client()
    monkeypatch.setattr("langflow.services.storage.s3.boto3.client", lambda *args, **kwargs: fake_client)

    settings_service = _settings_service(
        tmp_path,
        s3_public_base_url="https://cdn.example.com/langflow-media",
    )
    service = S3StorageService(SimpleNamespace(), settings_service)

    assert service.build_public_url("flow-9", "video/output.mp4", ttl_seconds=321) == (
        "https://cdn.example.com/langflow-media/prod/flow-9/video/output.mp4"
    )
    assert service.build_inline_url("flow-9", "video/output.mp4", kind="video") == (
        "https://cdn.example.com/langflow-media/prod/flow-9/video/output.mp4"
    )
