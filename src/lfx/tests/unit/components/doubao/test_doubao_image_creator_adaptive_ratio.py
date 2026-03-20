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


def test_seedream_5_lite_gateway_sets_png_and_web_search(
    monkeypatch: pytest.MonkeyPatch,
    _mock_images_gateway: list[dict[str, Any]],
):
    monkeypatch.setattr(
        DoubaoImageCreator,
        "_prepare_reference_images",
        lambda self, **_kwargs: ([], []),
    )

    component = DoubaoImageCreator(
        model_name=_find_model_name("Seedream 5.0"),
        prompt="test",
        resolution="3K",
        aspect_ratio="1:1",
        image_count=1,
        enable_google_search=True,
    )
    out = component.build_images()

    assert out.type == "image"
    assert _mock_images_gateway

    payload = _mock_images_gateway[0]
    extra_body = payload.get("extra_body") or {}
    assert extra_body.get("output_format") == "png"
    assert extra_body.get("tools") == [{"type": "web_search"}]


def test_update_build_config_seedream_5_lite_limits_resolution_and_search():
    component = DoubaoImageCreator()
    names = {"model_name", "resolution", "enable_google_search", "enable_multi_turn"}
    build_config: dict[str, Any] = {}
    for inp in getattr(type(component), "inputs", []) or []:
        name = getattr(inp, "name", None)
        if name in names and hasattr(inp, "to_dict"):
            build_config[name] = inp.to_dict()

    model_name = _find_model_name("Seedream 5.0")
    build_config["model_name"]["value"] = model_name
    out = component.update_build_config(build_config, model_name, "model_name")

    assert out["resolution"]["options"] == ["2K（推荐）", "3K"]
    assert out["image_count"]["range_spec"]["max"] == 15
    assert out["enable_google_search"]["show"] is True
    assert out["enable_multi_turn"]["show"] is False

    legacy_model_name = _find_model_name("Seedream 4.0")
    out = component.update_build_config(out, legacy_model_name, "model_name")
    assert out["enable_google_search"]["show"] is False


def test_seedream_5_lite_group_generation_uses_sequential_options(
    monkeypatch: pytest.MonkeyPatch,
    _mock_images_gateway: list[dict[str, Any]],
):
    monkeypatch.setattr(
        DoubaoImageCreator,
        "_prepare_reference_images",
        lambda self, **_kwargs: ([], []),
    )

    component = DoubaoImageCreator(
        model_name=_find_model_name("Seedream 5.0"),
        prompt="test",
        resolution="3K",
        aspect_ratio="1:1",
        image_count=4,
    )
    out = component.build_images()

    assert out.type == "image"
    payload = _mock_images_gateway[0]
    extra_body = payload.get("extra_body") or {}
    assert extra_body.get("sequential_image_generation") == "auto"
    assert extra_body.get("sequential_image_generation_options") == {"max_images": 4}


def test_seedream_5_lite_multi_reference_generation_passes_all_images(
    monkeypatch: pytest.MonkeyPatch,
    _mock_images_gateway: list[dict[str, Any]],
):
    reference_images = [
        "data:image/png;base64,aaa",
        "data:image/png;base64,bbb",
        "data:image/png;base64,ccc",
    ]
    monkeypatch.setattr(
        DoubaoImageCreator,
        "_prepare_reference_images",
        lambda self, **_kwargs: (
            reference_images,
            [{"index": idx} for idx in range(len(reference_images))],
        ),
    )

    component = DoubaoImageCreator(
        model_name=_find_model_name("Seedream 5.0"),
        prompt="test",
        resolution="2K（推荐）",
        aspect_ratio="adaptive",
        image_count=2,
    )
    out = component.build_images()

    assert out.type == "image"
    payload = _mock_images_gateway[0]
    extra_body = payload.get("extra_body") or {}
    assert extra_body.get("image") == reference_images


def test_seedream_5_lite_rejects_total_images_over_limit(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        DoubaoImageCreator,
        "_prepare_reference_images",
        lambda self, **_kwargs: (
            [f"data:image/png;base64,{idx}" for idx in range(14)],
            [{"index": idx} for idx in range(14)],
        ),
    )

    component = DoubaoImageCreator(
        model_name=_find_model_name("Seedream 5.0"),
        prompt="test",
        resolution="2K（推荐）",
        aspect_ratio="1:1",
        image_count=2,
    )
    out = component.build_images()

    assert out.type == "error"
    assert "参考图数量 + 生成张数不能超过 15" in str(out.data.get("error"))
