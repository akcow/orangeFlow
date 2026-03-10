from __future__ import annotations

import sys
import types
from typing import Any

import pytest

from lfx.components.doubao.doubao_image_creator import DoubaoImageCreator


@pytest.fixture
def _mock_images_gateway(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    captured: list[dict[str, Any]] = []

    def _images_generations(**kwargs):  # type: ignore[no-untyped-def]
        captured.append(kwargs)
        return {
            "id": "img_task_123",
            "data": [{"url": "https://example.com/image.png"}],
            "provider_response": {},
        }

    # `build_images` imports `langflow.gateway.client` at runtime.
    # Provide a tiny stub module tree for isolated lfx unit tests.
    client = types.ModuleType("langflow.gateway.client")
    client.images_generations = _images_generations  # type: ignore[attr-defined]
    gateway = types.ModuleType("langflow.gateway")
    gateway.client = client  # type: ignore[attr-defined]
    langflow = types.ModuleType("langflow")
    langflow.gateway = gateway  # type: ignore[attr-defined]

    sys.modules["langflow"] = langflow
    sys.modules["langflow.gateway"] = gateway
    sys.modules["langflow.gateway.client"] = client

    monkeypatch.setattr(
        DoubaoImageCreator,
        "_download_preview",
        lambda self, _url: (None, None),
    )
    return captured


def _find_model_name(prefix: str) -> str:
    for name in DoubaoImageCreator.MODEL_CATALOG:
        if str(name).startswith(prefix):
            return str(name)
    raise AssertionError(f"model not found for prefix: {prefix}")


def test_seedream_adaptive_reference_uses_reference_ratio_for_size(
    monkeypatch: pytest.MonkeyPatch,
    _mock_images_gateway: list[dict[str, Any]],
):
    monkeypatch.setattr(
        DoubaoImageCreator,
        "_prepare_reference_images",
        lambda self, **_kwargs: (["data:image/png;base64,stub"], [{"index": 0}]),
    )
    monkeypatch.setattr(
        DoubaoImageCreator,
        "_get_image_dimensions_from_data_url",
        staticmethod(lambda _data_url: (1600, 900)),
    )

    component = DoubaoImageCreator(
        model_name=_find_model_name("Seedream 4.0"),
        prompt="test",
        resolution=DoubaoImageCreator.DEFAULT_RESOLUTION_OPTIONS[0],
        aspect_ratio="adaptive",
        image_count=1,
    )
    out = component.build_images()

    assert out.type == "image"
    assert _mock_images_gateway

    payload = _mock_images_gateway[0]
    size = str(payload.get("size") or "")
    assert "x" in size.lower()
    width, height = [int(part) for part in size.lower().split("x", 1)]
    assert width != height


def test_gemini_adaptive_reference_uses_explicit_aspect_ratio_in_payload(
    monkeypatch: pytest.MonkeyPatch,
    _mock_images_gateway: list[dict[str, Any]],
):
    monkeypatch.setattr(
        DoubaoImageCreator,
        "_prepare_reference_images",
        lambda self, **_kwargs: (["data:image/png;base64,stub"], [{"index": 0}]),
    )
    monkeypatch.setattr(
        DoubaoImageCreator,
        "_get_image_dimensions_from_data_url",
        staticmethod(lambda _data_url: (1600, 900)),
    )

    component = DoubaoImageCreator(
        model_name="Nano Banana 2",
        prompt="test",
        resolution=DoubaoImageCreator.DEFAULT_RESOLUTION_OPTIONS[0],
        aspect_ratio="adaptive",
        image_count=1,
    )
    out = component.build_images()

    assert out.type == "image"
    assert _mock_images_gateway
    payload = _mock_images_gateway[0]

    extra_body = payload.get("extra_body") or {}
    gemini_payload = extra_body.get("gemini_payload") or {}
    image_config = ((gemini_payload.get("generationConfig") or {}).get("imageConfig") or {})
    assert image_config.get("aspectRatio") == "16:9"
