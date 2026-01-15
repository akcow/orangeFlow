from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
import requests

from lfx.components.doubao.doubao_video_generator import DoubaoVideoGenerator


@dataclass
class _MockResponse:
    status_code: int = 200
    json_data: dict[str, Any] | None = None
    text: str = ""
    headers: dict[str, str] | None = None
    content: bytes = b""

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            response = type("Resp", (), {"status_code": self.status_code, "text": self.text})()
            raise requests.HTTPError(self.text or "error", response=response)

    def json(self) -> dict[str, Any]:
        if self.json_data is None:
            raise ValueError("no json_data")
        return self.json_data


@pytest.fixture
def _mock_veo_requests(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    captured: list[dict[str, Any]] = []

    def _post(url: str, *, headers: dict[str, str] | None = None, json: dict[str, Any] | None = None, timeout: int = 60):
        assert url.endswith("/v1/videos")
        assert headers and "Authorization" in headers
        assert json is not None
        captured.append(json)
        return _MockResponse(status_code=200, json_data={"task_id": "task_123"}, text='{"task_id":"task_123"}')

    def _get(url: str, *, headers: dict[str, str] | None = None, timeout: int = 60):
        assert headers and "Authorization" in headers
        if url.endswith("/v1/videos/task_123"):
            return _MockResponse(status_code=200, json_data={"status": "completed", "progress": 100})
        if url.endswith("/v1/videos/task_123/content"):
            return _MockResponse(
                status_code=200,
                headers={"Content-Type": "video/mp4"},
                content=b"\x00\x01",
            )
        raise AssertionError(f"unexpected url: {url}")

    monkeypatch.setattr(requests, "post", _post)
    monkeypatch.setattr(requests, "get", _get)
    return captured


def test_veo_text_only_sends_duration_metadata(_mock_veo_requests: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(model_name="VEO3.1", duration=4, aspect_ratio="16:9", resolution="720p")
    result = component._build_video_veo(prompt="p", endpoint_id="veo-3.1-generate-preview", api_key="k")
    assert result.type == "video"
    payload = _mock_veo_requests[0]
    assert payload["model"] == "veo-3.1-generate-preview"
    assert "images" not in payload
    assert payload["metadata"]["durationSeconds"] == 4
    assert payload["metadata"]["resolution"] == "720p"


def test_veo_image_to_video_defaults_to_first_frame(_mock_veo_requests: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="VEO3.1",
        duration=4,
        resolution="720p",
        first_frame_image=[{"url": "https://example.com/start.jpg"}],
    )
    result = component._build_video_veo(prompt="p", endpoint_id="veo-3.1-generate-preview", api_key="k")
    assert result.type == "video"
    payload = _mock_veo_requests[0]
    assert payload["images"] == ["https://example.com/start.jpg"]
    assert payload["metadata"]["durationSeconds"] == 4
    assert payload["metadata"]["resolution"] == "720p"
    assert "referenceImages" not in payload.get("metadata", {})

def test_veo_first_frame_field_object_shape_is_supported(_mock_veo_requests: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="VEO3.1",
        duration=4,
        resolution="720p",
        first_frame_image={
            "value": [{"name": "start.jpg", "display_name": "start.jpg", "role": "first"}],
            "file_path": ["https://example.com/start.jpg"],
        },
    )
    result = component._build_video_veo(prompt="p", endpoint_id="veo-3.1-generate-preview", api_key="k")
    assert result.type == "video"
    payload = _mock_veo_requests[0]
    assert payload["images"] == ["https://example.com/start.jpg"]
    assert payload["metadata"]["durationSeconds"] == 4
    assert payload["metadata"]["resolution"] == "720p"


def test_veo_reference_images_switch_fast_to_standard_and_force_8s(_mock_veo_requests: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="veo3.1-fast",
        duration=4,
        aspect_ratio="16:9",
        resolution="720p",
        first_frame_image=[{"url": "https://example.com/ref.jpg", "role": "reference"}],
    )
    result = component._build_video_veo(prompt="p", endpoint_id="veo-3.1-fast-generate-preview", api_key="k")
    assert result.type == "video"
    payload = _mock_veo_requests[0]
    assert payload["model"] == "veo-3.1-generate-preview"
    assert payload["metadata"]["durationSeconds"] == 8
    assert payload["metadata"]["resolution"] == "720p"
    assert payload["metadata"]["referenceImages"][0]["image"]["bytesBase64Encoded"] == "https://example.com/ref.jpg"
    assert result.data["model"]["requested_model_id"] == "veo-3.1-fast-generate-preview"


def test_veo_interpolation_forces_8s(_mock_veo_requests: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="VEO3.1",
        duration=4,
        resolution="720p",
        first_frame_image=[{"url": "https://example.com/start.jpg"}],
        last_frame_image={"url": "https://example.com/end.jpg"},
    )
    result = component._build_video_veo(prompt="p", endpoint_id="veo-3.1-generate-preview", api_key="k")
    assert result.type == "video"
    payload = _mock_veo_requests[0]
    assert payload["images"] == ["https://example.com/start.jpg", "https://example.com/end.jpg"]
    assert payload["metadata"]["durationSeconds"] == 8
    assert payload["metadata"]["resolution"] == "720p"


def test_veo_reference_is_ignored_when_first_frame_exists(_mock_veo_requests: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="VEO3.1",
        duration=8,
        resolution="720p",
        first_frame_image=[
            {"url": "https://example.com/start.jpg", "role": "first"},
            {"url": "https://example.com/ref.jpg", "role": "reference"},
        ],
    )
    result = component._build_video_veo(prompt="p", endpoint_id="veo-3.1-generate-preview", api_key="k")
    assert result.type == "video"
    payload = _mock_veo_requests[0]
    assert payload["images"] == ["https://example.com/start.jpg"]
    assert "referenceImages" not in payload.get("metadata", {})


def test_veo_1080p_non_8s_downgrades_resolution_to_720p(_mock_veo_requests: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="VEO3.1",
        duration=4,
        resolution="1080p",
        aspect_ratio="16:9",
    )
    result = component._build_video_veo(prompt="p", endpoint_id="veo-3.1-generate-preview", api_key="k")
    assert result.type == "video"
    payload = _mock_veo_requests[0]
    assert payload["metadata"]["durationSeconds"] == 4
    assert payload["metadata"]["resolution"] == "720p"
