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
        return {"id": "kling_task_123"}

    def _poll(self: DoubaoVideoGenerator, **_kwargs):  # type: ignore[no-untyped-def]
        return Data(type="video", data={"id": "kling_task_123"})

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


def test_kling_generation_mode_video_edit_sets_base_refer_type(_mock_gateway: list[dict[str, Any]]):
    component = DoubaoVideoGenerator(
        model_name="kling O3",
        generation_mode="video_edit",
        prompt="edit this",
        duration=5,
        aspect_ratio="16:9",
        first_frame_image=[
            {"video_url": "https://example.com/base.mp4", "doubao_preview": {"kind": "video"}},
            {"url": "https://example.com/ref.png", "role": "reference"},
        ],
    )
    out = component._build_video_kling_gateway(prompt="edit this", endpoint_id="kling-v3-omni")
    assert out.type == "video"

    payload = _mock_gateway[0]["extra_body"]["kling_payload"]
    assert payload["video_list"][0]["refer_type"] == "base"
    assert payload["image_list"][0]["image_url"] == "https://example.com/ref.png"
    assert "type" not in payload["image_list"][0]
