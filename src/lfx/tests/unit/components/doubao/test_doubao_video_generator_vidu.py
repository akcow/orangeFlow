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
        return {"id": "vidu_task_123"}

    def _poll(self: DoubaoVideoGenerator, **_kwargs):  # type: ignore[no-untyped-def]
        # Avoid real polling/network. We only validate payload building.
        return Data(type="video", data={"id": "vidu_task_123"})

    # lfx tests run without langflow installed; provide a tiny stub module tree.
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


def test_vidu_text2video_routes_through_gateway(_mock_gateway: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="viduq3-pro",
        prompt="hello",
        duration=5,
        aspect_ratio="16:9",
        resolution="720p",
        vidu_audio=True,
    )
    out = component.build_video()
    assert out.type == "video"

    payload = _mock_gateway[0]
    assert payload["model"] == "viduq3-pro"
    assert payload["prompt"] == "hello"
    assert payload["ratio"] == "16:9"
    assert payload["duration"] == 5
    extra = payload["extra_body"]
    assert extra["resolution"] == "720p"
    assert extra["audio"] is True
    assert "images" not in extra


def test_vidu_img2video_is_rec_allows_empty_prompt(_mock_gateway: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="viduq3-pro",
        prompt="",
        duration=5,
        aspect_ratio="16:9",
        resolution="720p",
        first_frame_image=[{"url": "https://example.com/start.jpg"}],
        vidu_is_rec=True,
    )
    out = component.build_video()
    assert out.type == "video"

    payload = _mock_gateway[0]
    assert payload["model"] == "viduq3-pro"
    assert payload["prompt"] == ""
    extra = payload["extra_body"]
    assert extra["images"] == ["https://example.com/start.jpg"]
    assert extra["is_rec"] is True


def test_vidu_generation_mode_first_last_routes_start_end(_mock_gateway: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="viduq2-pro",
        generation_mode="first_last_frame",
        prompt="",
        duration=5,
        aspect_ratio="adaptive",
        resolution="720p",
        first_frame_image=[{"url": "https://example.com/start.jpg"}],
        last_frame_image={"url": "https://example.com/end.jpg"},
        vidu_audio=True,
    )
    out = component.build_video()
    assert out.type == "video"

    payload = _mock_gateway[0]
    extra = payload["extra_body"]
    assert extra["images"] == ["https://example.com/start.jpg", "https://example.com/end.jpg"]
    assert extra["audio"] is True


def test_update_build_config_vidu_clamps_controls():
    component = DoubaoVideoGenerator()
    names = {
        "model_name",
        "generation_mode",
        "resolution",
        "duration",
        "aspect_ratio",
        "last_frame_image",
        "enable_audio",
        "audio_input",
        "vidu_is_rec",
        "vidu_seed",
        "vidu_movement_amplitude",
        "vidu_bgm",
        "vidu_audio",
        "vidu_voice_id",
        "vidu_off_peak",
        "vidu_watermark",
        "vidu_wm_position",
        "vidu_wm_url",
        "vidu_payload",
        "vidu_meta_data",
        "vidu_callback_url",
        "vidu_max_wait_seconds",
    }
    build_config: dict[str, Any] = {}
    for inp in getattr(type(component), "inputs", []) or []:
        name = getattr(inp, "name", None)
        if name in names and hasattr(inp, "to_dict"):
            build_config[name] = inp.to_dict()

    build_config["model_name"]["value"] = "viduq3-pro"
    out = component.update_build_config(build_config, "viduq3-pro", "model_name")

    assert out["generation_mode"]["options"] == ["text", "first_frame"]
    assert out["resolution"]["options"] == ["540p", "720p", "1080p"]
    assert out["duration"]["range_spec"]["min"] == 1
    assert out["duration"]["range_spec"]["max"] == 16
    assert out["aspect_ratio"]["options"] == ["16:9", "9:16", "4:3", "3:4", "1:1"]
    assert out["last_frame_image"]["show"] is False
    # These two are surfaced via the frontend "画面参数" dropdown, so keep them hidden in the default panel.
    assert out["vidu_audio"]["show"] is False
    assert out["vidu_is_rec"]["show"] is False
