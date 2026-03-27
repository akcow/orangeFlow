from __future__ import annotations

import sys
import types
from typing import Any

import pytest

from lfx.components.doubao.doubao_video_generator import DoubaoVideoGenerator
from lfx.schema.data import Data


@pytest.fixture
def _mock_gateway(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    captured: list[dict[str, Any]] = []

    def _videos_create(*, model: str, prompt: str, user_id: str | None = None, **kwargs):
        captured.append({"model": model, "prompt": prompt, "user_id": user_id, **kwargs})
        return {"id": "task_123"}

    def _poll(self: DoubaoVideoGenerator, **_kwargs):  # type: ignore[no-untyped-def]
        # Avoid real polling/network. We only validate payload building.
        return Data(type="video", data={"id": "task_123"})

    # The component imports `langflow.gateway.client` at runtime, but lfx unit tests run
    # in isolation (langflow must not be installed). Provide a tiny stub module tree.
    client = types.ModuleType("langflow.gateway.client")
    client.videos_create = _videos_create  # type: ignore[attr-defined]
    gateway = types.ModuleType("langflow.gateway")
    gateway.client = client  # type: ignore[attr-defined]
    langflow = types.ModuleType("langflow")
    langflow.gateway = gateway  # type: ignore[attr-defined]

    sys.modules["langflow"] = langflow
    sys.modules["langflow.gateway"] = gateway
    sys.modules["langflow.gateway.client"] = client

    monkeypatch.setattr(DoubaoVideoGenerator, "_poll_gateway_video", _poll)
    return captured


def test_wan_last_frame_is_ignored_and_still_i2v(_mock_gateway: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="wan2.6",
        duration=10,
        resolution="720p",
        aspect_ratio="16:9",
        first_frame_image=[
            {"url": "https://example.com/start.jpg", "role": "first"},
            {"url": "https://example.com/end.jpg", "role": "last"},
        ],
    )
    out = component._build_video_wan_gateway(prompt="p", model_name="wan2.6")
    assert out.type == "video"

    payload = _mock_gateway[0]
    assert payload["model"] == "wan2.6-i2v"
    assert payload["duration"] == 10
    extra = payload["extra_body"]
    assert extra["img_url"] == "https://example.com/start.jpg"
    assert extra["resolution"] == "720P"
    assert "size" not in extra
    assert "first_frame_url" not in extra
    assert "last_frame_url" not in extra


def test_wan_i2v_uses_img_url_and_i2v_model(_mock_gateway: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="wan2.6",
        duration=15,
        resolution="720p",
        aspect_ratio="16:9",
        first_frame_image=[{"url": "https://example.com/start.jpg"}],
    )
    out = component._build_video_wan_gateway(prompt="p", model_name="wan2.6")
    assert out.type == "video"

    payload = _mock_gateway[0]
    assert payload["model"] == "wan2.6-i2v"
    assert payload["duration"] == 15
    extra = payload["extra_body"]
    assert extra["img_url"] == "https://example.com/start.jpg"
    assert extra["resolution"] == "720P"


def test_wan_generation_mode_text_keeps_legacy_media_inference(_mock_gateway: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="wan2.6",
        generation_mode="text",
        prompt="p",
        duration=10,
        resolution="720p",
        aspect_ratio="16:9",
        first_frame_image=[{"url": "https://example.com/start.jpg"}],
    )
    out = component._build_video_wan_gateway(prompt="p", model_name="wan2.6")
    assert out.type == "video"

    payload = _mock_gateway[0]
    assert payload["model"] == "wan2.6-i2v"
    extra = payload["extra_body"]
    assert extra["img_url"] == "https://example.com/start.jpg"


def test_wan_r2v_prefers_public_url_for_uploaded_video(_mock_gateway: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="wan2.6",
        duration=10,
        resolution="720p",
        aspect_ratio="16:9",
        first_frame_image=[
            {
                "video_url": "/api/v1/files/media/flow-1/source.mp4",
                "public_url": "https://cdn.example.com/flow-1/source.mp4?token=abc",
                "doubao_preview": {"kind": "video"},
            }
        ],
    )
    out = component._build_video_wan_gateway(prompt="p", model_name="wan2.6")
    assert out.type == "video"

    payload = _mock_gateway[0]
    assert payload["model"] == "wan2.6-r2v"
    extra = payload["extra_body"]
    assert extra["reference_video_urls"] == ["https://cdn.example.com/flow-1/source.mp4?token=abc"]
    assert "img_url" not in extra


def test_wan_r2v_uses_file_path_upload_shape(monkeypatch: pytest.MonkeyPatch, _mock_gateway: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="wan2.6",
        duration=10,
        resolution="720p",
        aspect_ratio="16:9",
        first_frame_image={
            "value": [{"name": "source.mp4", "role": "reference"}],
            "file_path": ["flow-1/source.mp4"],
        },
    )
    monkeypatch.setattr(
        DoubaoVideoGenerator,
        "_build_public_file_url",
        lambda self, file_path, ttl_seconds=3600: "https://cdn.example.com/flow-1/source.mp4?token=xyz",
    )

    out = component._build_video_wan_gateway(prompt="p", model_name="wan2.6")
    assert out.type == "video"

    payload = _mock_gateway[0]
    assert payload["model"] == "wan2.6-r2v"
    extra = payload["extra_body"]
    assert extra["reference_video_urls"] == ["https://cdn.example.com/flow-1/source.mp4?token=xyz"]
    assert "img_url" not in extra


def test_wan_r2v_uses_video_kind_when_url_has_no_video_suffix(_mock_gateway: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="wan2.6",
        duration=10,
        resolution="720p",
        aspect_ratio="16:9",
        first_frame_image=[{"video_url": "https://cdn.example.com/resource?id=1", "doubao_preview": {"kind": "video"}}],
    )
    out = component._build_video_wan_gateway(prompt="p", model_name="wan2.6")
    assert out.type == "video"

    payload = _mock_gateway[0]
    assert payload["model"] == "wan2.6-r2v"
    extra = payload["extra_body"]
    assert extra["reference_video_urls"] == ["https://cdn.example.com/resource?id=1"]
    assert "img_url" not in extra


def test_wan_r2v_supports_mixed_video_and_image_reference_urls(_mock_gateway: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="wan2.6",
        duration=10,
        resolution="720p",
        aspect_ratio="16:9",
        first_frame_image=[
            {"video_url": "https://cdn.example.com/char1.mp4", "doubao_preview": {"kind": "video"}},
            {"url": "https://cdn.example.com/char2.png", "role": "reference"},
        ],
    )
    out = component._build_video_wan_gateway(prompt="p", model_name="wan2.6")
    assert out.type == "video"

    payload = _mock_gateway[0]
    assert payload["model"] == "wan2.6-r2v"
    extra = payload["extra_body"]
    assert extra["reference_urls"] == [
        "https://cdn.example.com/char1.mp4",
        "https://cdn.example.com/char2.png",
    ]
    assert extra["reference_video_urls"] == ["https://cdn.example.com/char1.mp4"]
