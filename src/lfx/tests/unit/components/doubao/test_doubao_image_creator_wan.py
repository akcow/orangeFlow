from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from lfx.components.doubao import doubao_image_creator as image_creator_module
from lfx.components.doubao.doubao_image_creator import DoubaoImageCreator
from lfx.schema.data import Data


@pytest.fixture
def _mock_dashscope_sync(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    captured: dict[str, Any] = {}

    def _resolve_credentials(**_kwargs):  # type: ignore[no-untyped-def]
        return SimpleNamespace(api_key="sk-test")

    def _sync_generate(self: DoubaoImageCreator, **kwargs):  # type: ignore[no-untyped-def]
        captured.update(kwargs)
        return Data(type="image", data={"ok": True})

    monkeypatch.setattr(image_creator_module, "resolve_credentials", _resolve_credentials)
    monkeypatch.setattr(DoubaoImageCreator, "_dashscope_sync_generate", _sync_generate)
    return captured


def test_wan_adaptive_reference_uses_explicit_size_from_reference_ratio(
    monkeypatch: pytest.MonkeyPatch,
    _mock_dashscope_sync: dict[str, Any],
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
        model_name="wan2.6",
        resolution=DoubaoImageCreator.DEFAULT_RESOLUTION_OPTIONS[0],
        aspect_ratio="adaptive",
        image_count=1,
    )
    out = component._build_images_dashscope(
        prompt="test",
        model_meta=DoubaoImageCreator.MODEL_CATALOG["wan2.6"],
    )

    assert out.type == "image"
    assert _mock_dashscope_sync["size"] == "1280*720"
    assert _mock_dashscope_sync["size_info"]["ratio"] == "adaptive"
    assert _mock_dashscope_sync["size_info"]["size_value"] == "1280*720"


def test_wan_adaptive_reference_still_sends_size_when_reference_dimensions_unreadable(
    monkeypatch: pytest.MonkeyPatch,
    _mock_dashscope_sync: dict[str, Any],
):
    monkeypatch.setattr(
        DoubaoImageCreator,
        "_prepare_reference_images",
        lambda self, **_kwargs: (["data:image/png;base64,stub"], [{"index": 0}]),
    )
    monkeypatch.setattr(
        DoubaoImageCreator,
        "_get_image_dimensions_from_data_url",
        staticmethod(lambda _data_url: (None, None)),
    )

    component = DoubaoImageCreator(
        model_name="wan2.6",
        resolution=DoubaoImageCreator.DEFAULT_RESOLUTION_OPTIONS[0],
        aspect_ratio="adaptive",
        image_count=1,
    )
    out = component._build_images_dashscope(
        prompt="test",
        model_meta=DoubaoImageCreator.MODEL_CATALOG["wan2.6"],
    )

    assert out.type == "image"
    assert _mock_dashscope_sync["size"] == "1280*1280"
    assert _mock_dashscope_sync["size_info"]["ratio"] == "adaptive"
    assert _mock_dashscope_sync["size_info"]["size_value"] == "1280*1280"
