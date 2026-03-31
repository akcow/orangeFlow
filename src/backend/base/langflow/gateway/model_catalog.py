from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

ModelType = Literal["text", "image", "video", "audio"]
RelayProvider = Literal["openai", "12api", "doubao", "dashscope", "qwen", "vidu", "kling", "jimeng"]
RelayServiceType = Literal["text", "image", "video", "audio"]


@dataclass(frozen=True, slots=True)
class GatewayModelCatalogItem:
    id: str
    full_name: str
    model_type: ModelType
    owned_by: str
    relay_provider: RelayProvider
    relay_service_type: RelayServiceType


def _item(
    model_id: str,
    full_name: str,
    *,
    model_type: ModelType,
    owned_by: str,
    relay_provider: RelayProvider,
    relay_service_type: RelayServiceType,
) -> GatewayModelCatalogItem:
    return GatewayModelCatalogItem(
        id=model_id,
        full_name=full_name,
        model_type=model_type,
        owned_by=owned_by,
        relay_provider=relay_provider,
        relay_service_type=relay_service_type,
    )


_MODEL_CATALOG: tuple[GatewayModelCatalogItem, ...] = (
    _item(
        "gpt-4o-mini",
        "GPT-4o Mini",
        model_type="text",
        owned_by="openai",
        relay_provider="openai",
        relay_service_type="text",
    ),
    _item(
        "gpt-4o",
        "GPT-4o",
        model_type="text",
        owned_by="openai",
        relay_provider="openai",
        relay_service_type="text",
    ),
    _item(
        "gpt-4.1",
        "GPT-4.1",
        model_type="text",
        owned_by="openai",
        relay_provider="openai",
        relay_service_type="text",
    ),
    _item(
        "gpt-4.1-mini",
        "GPT-4.1 Mini",
        model_type="text",
        owned_by="openai",
        relay_provider="openai",
        relay_service_type="text",
    ),
    _item(
        "gpt-4.1-nano",
        "GPT-4.1 Nano",
        model_type="text",
        owned_by="openai",
        relay_provider="openai",
        relay_service_type="text",
    ),
    _item(
        "gpt-image-1",
        "GPT Image 1",
        model_type="image",
        owned_by="openai",
        relay_provider="openai",
        relay_service_type="image",
    ),
    _item(
        "deepseek-chat",
        "DeepSeek Chat",
        model_type="text",
        owned_by="deepseek",
        relay_provider="openai",
        relay_service_type="text",
    ),
    _item(
        "deepseek-reasoner",
        "DeepSeek Reasoner",
        model_type="text",
        owned_by="deepseek",
        relay_provider="openai",
        relay_service_type="text",
    ),
    _item(
        "gemini-3-flash-preview",
        "Gemini 3 Flash",
        model_type="text",
        owned_by="google",
        relay_provider="12api",
        relay_service_type="text",
    ),
    _item(
        "gemini-3-pro-preview",
        "Gemini 3 Pro",
        model_type="text",
        owned_by="google",
        relay_provider="12api",
        relay_service_type="text",
    ),
    _item(
        "gemini-3.1-flash-image-preview",
        "Nano Banana 2",
        model_type="image",
        owned_by="google",
        relay_provider="12api",
        relay_service_type="image",
    ),
    _item(
        "gemini-3-pro-image-preview",
        "Nano Banana Pro",
        model_type="image",
        owned_by="google",
        relay_provider="12api",
        relay_service_type="image",
    ),
    _item(
        "doubao-seedream-5-0-260128",
        "Doubao Seedream 5.0 Lite",
        model_type="image",
        owned_by="doubao",
        relay_provider="doubao",
        relay_service_type="image",
    ),
    _item(
        "doubao-seedream-4-5-251128",
        "Doubao Seedream 4.5",
        model_type="image",
        owned_by="doubao",
        relay_provider="doubao",
        relay_service_type="image",
    ),
    _item(
        "doubao-seedream-4-0-250828",
        "Doubao Seedream 4.0",
        model_type="image",
        owned_by="doubao",
        relay_provider="doubao",
        relay_service_type="image",
    ),
    _item(
        "doubao-seedance-1-0-pro-250528",
        "Doubao Seedance 1.0 Pro",
        model_type="video",
        owned_by="doubao",
        relay_provider="doubao",
        relay_service_type="video",
    ),
    _item(
        "doubao-seedance-1-5-pro-251215",
        "Doubao Seedance 1.5 Pro",
        model_type="video",
        owned_by="doubao",
        relay_provider="doubao",
        relay_service_type="video",
    ),
    _item(
        "sora-2",
        "Sora 2",
        model_type="video",
        owned_by="openai",
        relay_provider="12api",
        relay_service_type="video",
    ),
    _item(
        "sora-2-pro",
        "Sora 2 Pro",
        model_type="video",
        owned_by="openai",
        relay_provider="12api",
        relay_service_type="video",
    ),
    _item(
        "veo-3.1-generate-preview",
        "Veo 3.1",
        model_type="video",
        owned_by="google",
        relay_provider="12api",
        relay_service_type="video",
    ),
    _item(
        "veo-3.1-fast-generate-preview",
        "Veo 3.1 Fast",
        model_type="video",
        owned_by="google",
        relay_provider="12api",
        relay_service_type="video",
    ),
    _item(
        "wan2.6-t2i",
        "Wan 2.6 T2I",
        model_type="image",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="image",
    ),
    _item(
        "wan2.6-image",
        "Wan 2.6 I2I",
        model_type="image",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="image",
    ),
    _item(
        "wan2.5-t2i-preview",
        "Wan 2.5 T2I",
        model_type="image",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="image",
    ),
    _item(
        "wan2.5-i2i-preview",
        "Wan 2.5 I2I",
        model_type="image",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="image",
    ),
    _item(
        "wanx2.1-imageedit",
        "WanX 2.1 Image Edit",
        model_type="image",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="image",
    ),
    _item(
        "qwen-image-edit-max",
        "Qwen Image Edit Max",
        model_type="image",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="image",
    ),
    _item(
        "jimeng-smart-hd",
        "Jimeng Smart HD",
        model_type="image",
        owned_by="jimeng",
        relay_provider="jimeng",
        relay_service_type="image",
    ),
    _item(
        "wan2.6",
        "Wan 2.6 Video",
        model_type="video",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="video",
    ),
    _item(
        "wan2.6-t2v",
        "Wan 2.6 T2V",
        model_type="video",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="video",
    ),
    _item(
        "wan2.6-i2v",
        "Wan 2.6 I2V",
        model_type="video",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="video",
    ),
    _item(
        "wan2.6-i2v-flash",
        "Wan 2.6 I2V Flash",
        model_type="video",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="video",
    ),
    _item(
        "wan2.6-r2v",
        "Wan 2.6 R2V",
        model_type="video",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="video",
    ),
    _item(
        "wan2.6-r2v-flash",
        "Wan 2.6 R2V Flash",
        model_type="video",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="video",
    ),
    _item(
        "wan2.5",
        "Wan 2.5 Video",
        model_type="video",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="video",
    ),
    _item(
        "wan2.5-t2v-preview",
        "Wan 2.5 T2V",
        model_type="video",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="video",
    ),
    _item(
        "wan2.5-i2v-preview",
        "Wan 2.5 I2V",
        model_type="video",
        owned_by="dashscope",
        relay_provider="dashscope",
        relay_service_type="video",
    ),
    _item(
        "qwen3-tts-flash-2025-11-27",
        "Qwen TTS Flash",
        model_type="audio",
        owned_by="dashscope",
        relay_provider="qwen",
        relay_service_type="audio",
    ),
    _item(
        "viduq2-pro",
        "Vidu Q2 Pro",
        model_type="video",
        owned_by="vidu",
        relay_provider="vidu",
        relay_service_type="video",
    ),
    _item(
        "viduq3-pro",
        "Vidu Q3 Pro",
        model_type="video",
        owned_by="vidu",
        relay_provider="vidu",
        relay_service_type="video",
    ),
    _item(
        "vidu-upscale",
        "Vidu Upscale",
        model_type="video",
        owned_by="vidu",
        relay_provider="vidu",
        relay_service_type="video",
    ),
    _item(
        "kling-image-o1",
        "Kling O1 Image",
        model_type="image",
        owned_by="kling",
        relay_provider="kling",
        relay_service_type="image",
    ),
    _item(
        "kling-v3",
        "Kling V3 Image",
        model_type="image",
        owned_by="kling",
        relay_provider="kling",
        relay_service_type="image",
    ),
    _item(
        "kling-video-o1",
        "Kling O1 Video",
        model_type="video",
        owned_by="kling",
        relay_provider="kling",
        relay_service_type="video",
    ),
    _item(
        "kling-v3-omni",
        "Kling O3 Video",
        model_type="video",
        owned_by="kling",
        relay_provider="kling",
        relay_service_type="video",
    ),
)


def list_gateway_model_catalog() -> list[GatewayModelCatalogItem]:
    return list(_MODEL_CATALOG)


def serialize_gateway_model_catalog() -> list[dict[str, str]]:
    return [asdict(item) for item in _MODEL_CATALOG]


def list_gateway_models_payload() -> list[dict[str, str]]:
    return [
        {
            "id": item.id,
            "object": "model",
            "owned_by": item.owned_by,
        }
        for item in _MODEL_CATALOG
    ]


def list_model_page_records(model_type: str | None = None) -> list[dict[str, str]]:
    return [
        {
            "id": item.id,
            "fullName": item.full_name,
            "type": "chat" if item.model_type == "text" else item.model_type,
        }
        for item in _MODEL_CATALOG
        if not model_type or ("chat" if item.model_type == "text" else item.model_type) == model_type
    ]


def find_gateway_model_by_full_name(full_name: str) -> dict[str, str] | None:
    normalized = (full_name or "").strip()
    if not normalized:
        return None

    for item in _MODEL_CATALOG:
        if item.full_name != normalized:
            continue
        return {
            "id": item.id,
            "fullName": item.full_name,
            "type": "chat" if item.model_type == "text" else item.model_type,
        }

    return None
