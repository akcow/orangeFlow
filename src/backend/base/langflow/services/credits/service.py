from __future__ import annotations

import os
import re
from dataclasses import dataclass
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import func, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from langflow.services.database.models.credit.model import (
    CreditAccount,
    CreditLedgerEntry,
    CreditLedgerEntryType,
    CreditPricingRule,
    CreditResourceType,
)
from langflow.services.database.models.user.model import User

DEFAULT_INITIAL_CREDITS = int(os.getenv("LANGFLOW_CREDITS_INITIAL_BALANCE", "100"))
DEFAULT_IMAGE_CREDITS_COST = int(os.getenv("LANGFLOW_CREDITS_DEFAULT_IMAGE_COST", "10"))
DEFAULT_VIDEO_CREDITS_COST = int(os.getenv("LANGFLOW_CREDITS_DEFAULT_VIDEO_COST", "30"))
DEFAULT_TEXT_CREDITS_COST = int(os.getenv("LANGFLOW_CREDITS_DEFAULT_TEXT_COST", "0"))

CREDITS_PER_RMB = Decimal("10")
SALES_PRICE_MULTIPLIER = Decimal("1.2")
CREDIT_MULTIPLIER = CREDITS_PER_RMB * SALES_PRICE_MULTIPLIER
MILLION = Decimal("1000000")
SEEDANCE_FPS = Decimal("24")


@dataclass(slots=True)
class ChargeableBuildItem:
    vertex_id: str
    component_key: str
    resource_type: CreditResourceType
    model_key: str
    display_name: str
    credits_cost: int


@dataclass(slots=True)
class CreditEstimate:
    component_key: str
    resource_type: CreditResourceType | None
    model_key: str | None
    display_name: str | None
    billing_mode: str
    estimated_credits: int | None


@dataclass(slots=True)
class CreditBalanceCheck:
    account: CreditAccount
    items: list[ChargeableBuildItem]
    total_required: int


MODEL_NAME_ALIASES: dict[str, str] = {
    "doubao-seedance-1-5-pro-251215": "seedance 1.5 pro",
    "doubao-seedance-1.5-pro 251215": "seedance 1.5 pro",
    "doubao-seedance-1-0-pro-250528": "seedance 1.0 pro",
    "doubao-seedance-1.0-pro 250528": "seedance 1.0 pro",
    "doubao-seedream-5-0-260128": "seedream 5.0 lite",
    "doubao-seedream-5-0-lite-260128": "seedream 5.0 lite",
    "doubao-seedream-5-0-lite": "seedream 5.0 lite",
    "doubao-seedream-5.0-lite": "seedream 5.0 lite",
    "doubao-seedream-4-5-251128": "seedream 4.5",
    "doubao-seedream-4-0-250828": "seedream 4.0",
    "gemini-3.1-flash-image-preview": "nano banana 2",
    "gemini-3-pro-image-preview": "nano banana pro",
    "kling-image-o1": "kling o1",
    "kling-video-o1": "kling o1",
    "kling-video-01": "kling o1",
    "kling-v3-omni": "kling o3",
    "kling-v3": "kling v3",
}

CHARGEABLE_COMPONENT_RESOURCE_TYPES: dict[str, CreditResourceType] = {
    "DoubaoImageCreator": CreditResourceType.IMAGE,
    "DoubaoVideoGenerator": CreditResourceType.VIDEO,
    "TextCreation": CreditResourceType.TEXT,
}

DEFAULT_PRICING_RULES: list[tuple[CreditResourceType, str, str, str, int]] = [
    (
        CreditResourceType.IMAGE,
        "DoubaoImageCreator",
        "seedream 5.0 lite",
        "Seedream 5.0 Lite",
        3,
    ),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "seedream 4.5", "Seedream 4.5", 3),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "seedream 4.0", "Seedream 4.0", 2),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "nano banana 2", "Nano Banana 2", 1),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "nano banana pro", "Nano Banana Pro", 2),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "wan2.6", "Wan 2.6", 2),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "wan2.5", "Wan 2.5", 2),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "kling o1", "Kling O1", 2),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "kling o3", "Kling O3", 2),
    (CreditResourceType.IMAGE, "DoubaoImageCreator", "kling v3", "Kling V3", 2),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "seedance 1.5 pro", "Seedance 1.5 Pro", 1),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "seedance 1.0 pro", "Seedance 1.0 Pro", 1),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "wan2.6", "Wan 2.6", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "wan2.5", "Wan 2.5", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "veo3.1", "Veo 3.1", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "veo3.1-fast", "Veo 3.1 Fast", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "sora-2", "Sora 2", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "sora-2-pro", "Sora 2 Pro", DEFAULT_VIDEO_CREDITS_COST),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "kling o1", "Kling O1", 7),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "kling o3", "Kling O3", 10),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "kling v3", "Kling V3", 10),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "viduq2-pro", "Vidu Q2 Pro", 3),
    (CreditResourceType.VIDEO, "DoubaoVideoGenerator", "viduq3-pro", "Vidu Q3 Pro", 5),
    (CreditResourceType.TEXT, "TextCreation", "deepseek-chat", "DeepSeek Chat", DEFAULT_TEXT_CREDITS_COST),
    (CreditResourceType.TEXT, "TextCreation", "deepseek-reasoner", "DeepSeek Reasoner", DEFAULT_TEXT_CREDITS_COST),
    (CreditResourceType.TEXT, "TextCreation", "gemini-3-pro-preview", "Gemini 3 Pro", DEFAULT_TEXT_CREDITS_COST),
    (CreditResourceType.TEXT, "TextCreation", "gemini-3-flash-preview", "Gemini 3 Flash", DEFAULT_TEXT_CREDITS_COST),
]

DEFAULT_PRICING_RULE_INDEX: dict[tuple[str, str], tuple[CreditResourceType, str, str, str, int]] = {
    (component_key, model_key): (resource_type, component_key, model_key, display_name, credits_cost)
    for resource_type, component_key, model_key, display_name, credits_cost in DEFAULT_PRICING_RULES
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_model_name(raw_value: str | None) -> str:
    normalized = (
        str(raw_value or "")
        .lower()
        .replace("\uff08", "(")
        .replace("\uff09", ")")
        .replace("\u00b7", " ")
        .replace("|", " ")
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()
    normalized = re.sub(r"\([^)]*\)", "", normalized).strip()
    normalized = re.sub(r"\s+", " ", normalized).strip()

    if normalized.startswith("seedream 5.0"):
        normalized = "seedream 5.0 lite"
    elif normalized.startswith("seedream 4.5"):
        normalized = "seedream 4.5"
    elif normalized.startswith("seedream 4.0"):
        normalized = "seedream 4.0"
    elif normalized.startswith("seedance 1.5 pro"):
        normalized = "seedance 1.5 pro"
    elif normalized.startswith("seedance 1.0 pro"):
        normalized = "seedance 1.0 pro"

    return MODEL_NAME_ALIASES.get(normalized, normalized)


def get_component_key_from_vertex_id(vertex_id: str) -> str:
    return str(vertex_id).split("-", maxsplit=1)[0]


def _get_template_field(template: dict | None, field_name: str) -> dict[str, Any] | None:
    if not isinstance(template, dict):
        return None
    field = template.get(field_name)
    return field if isinstance(field, dict) else None


def _extract_template_raw_value(template: dict | None, field_name: str) -> Any:
    field = _get_template_field(template, field_name)
    if not field:
        return None
    value = field.get("value")
    if value not in (None, ""):
        return value
    default = field.get("default")
    if default not in (None, ""):
        return default
    options = field.get("options")
    if isinstance(options, list) and options:
        return options[0]
    return None


def _extract_template_value(template: dict | None, field_name: str) -> str | None:
    raw_value = _extract_template_raw_value(template, field_name)
    if raw_value in (None, ""):
        return None
    return str(raw_value)


def _to_decimal(value: Any, default: str = "0") -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


def _round_half_up_to_int(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def convert_cost_price_to_credits(cost_price_rmb: Decimal | str | int | float) -> int:
    return _round_half_up_to_int(_to_decimal(cost_price_rmb) * CREDIT_MULTIPLIER)


def convert_gemini_cost_price_to_credits(cost_price_rmb: Decimal | str | int | float) -> int:
    credits = _to_decimal(cost_price_rmb) * CREDIT_MULTIPLIER
    if credits <= 0:
        return 0
    if credits == credits.to_integral_value():
        return int(credits)
    return int(credits.quantize(Decimal("1"), rounding=ROUND_CEILING))


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        if isinstance(value, bool):
            return int(value)
        return int(float(str(value)))
    except Exception:
        return default


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _to_list(value: Any) -> list[Any]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [item for item in value if item not in (None, "")]
    return [value]


def _extract_file_like_entries(field: dict[str, Any] | None) -> list[str]:
    if not field:
        return []
    candidates: list[str] = []
    for raw_entry in (field.get("file_path"), field.get("value")):
        for entry in _to_list(raw_entry):
            if isinstance(entry, str):
                trimmed = entry.strip()
                if trimmed:
                    candidates.append(trimmed)
                continue
            if isinstance(entry, dict):
                for candidate in (
                    entry.get("file_path"),
                    entry.get("path"),
                    entry.get("value"),
                    entry.get("url"),
                    entry.get("image_url"),
                    entry.get("video_url"),
                    entry.get("display_name"),
                    entry.get("name"),
                ):
                    if isinstance(candidate, str) and candidate.strip():
                        candidates.append(candidate.strip())
    return candidates


def _contains_video_file(field: dict[str, Any] | None) -> bool:
    video_extensions = (".mp4", ".mov", ".avi", ".webm", ".mkv", ".flv", ".m3u8", ".ts", ".mp_")
    return any(str(entry).lower().split("?", maxsplit=1)[0].endswith(video_extensions) for entry in _extract_file_like_entries(field))


def _has_file_entries(field: dict[str, Any] | None) -> bool:
    return bool(_extract_file_like_entries(field))


def _normalize_image_resolution(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if "4k" in raw:
        return "4k"
    if "2k" in raw:
        return "2k"
    if "1k" in raw:
        return "1k"
    match = re.findall(r"\d+", raw)
    if len(match) >= 2:
        dimensions = [int(item) for item in match[:2]]
        if max(dimensions) >= 3000:
            return "4k"
        if max(dimensions) > 1400:
            return "2k"
    return "1k"


def _normalize_video_resolution(value: Any) -> str:
    raw = str(value or "").strip().lower()
    for option in ("1080p", "720p", "540p", "480p"):
        if option in raw:
            return option
    match = re.search(r"(\d{3,4})", raw)
    if not match:
        return ""
    numeric = int(match.group(1))
    if numeric >= 1080:
        return "1080p"
    if numeric >= 720:
        return "720p"
    if numeric >= 540:
        return "540p"
    if numeric >= 480:
        return "480p"
    return ""


def _get_seedance_dimensions(resolution: str) -> tuple[int, int] | None:
    if resolution == "480p":
        return 854, 480
    if resolution == "720p":
        return 1280, 720
    if resolution == "1080p":
        return 1920, 1080
    return None


def _find_usage_payload(sources: list[Any] | None) -> dict[str, Any] | None:
    if not sources:
        return None
    queue: list[Any] = list(sources)
    while queue:
        current = queue.pop(0)
        if current is None:
            continue
        if hasattr(current, "model_dump"):
            try:
                queue.append(current.model_dump())
            except Exception:
                pass
            continue
        if isinstance(current, dict):
            usage = current.get("usage")
            if isinstance(usage, dict):
                return usage
            if any(
                key in current
                for key in (
                    "prompt_tokens",
                    "completion_tokens",
                    "input_tokens",
                    "output_tokens",
                    "promptTokenCount",
                    "candidatesTokenCount",
                )
            ):
                return current
            queue.extend(current.values())
            continue
        if isinstance(current, (list, tuple, set)):
            queue.extend(list(current))
    return None


def _extract_usage_int(payload: dict[str, Any] | None, *paths: tuple[str, ...]) -> int | None:
    if not payload:
        return None
    for path in paths:
        current: Any = payload
        for key in path:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(key)
        if current is None:
            continue
        try:
            return int(current)
        except Exception:
            try:
                return int(float(str(current)))
            except Exception:
                continue
    return None


def _calculate_image_cost_price(component_key: str, model_key: str, template: dict[str, Any] | None) -> Decimal | None:
    if component_key != "DoubaoImageCreator":
        return None
    image_count = max(_coerce_int(_extract_template_raw_value(template, "image_count"), default=1), 1)
    if model_key == "seedream 5.0 lite":
        return Decimal("0.22") * image_count
    if model_key == "seedream 4.5":
        return Decimal("0.25") * image_count
    if model_key == "seedream 4.0":
        return Decimal("0.2") * image_count
    if model_key in {"wan2.5", "wan2.6", "kling o1", "kling o3", "kling v3"}:
        return Decimal("0.2") * image_count
    if model_key in {"nano banana 2", "nano banana pro"}:
        resolution = _normalize_image_resolution(_extract_template_raw_value(template, "resolution"))
        unit_price_map = (
            {"1k": Decimal("0.1"), "2k": Decimal("0.1"), "4k": Decimal("0.18")}
            if model_key == "nano banana 2"
            else {"1k": Decimal("0.15"), "2k": Decimal("0.15"), "4k": Decimal("0.225")}
        )
        return unit_price_map.get(resolution, unit_price_map["1k"]) * image_count
    return None


def _calculate_seedance_cost_price(model_key: str, template: dict[str, Any] | None) -> Decimal | None:
    resolution = _normalize_video_resolution(_extract_template_raw_value(template, "resolution"))
    dimensions = _get_seedance_dimensions(resolution)
    if not dimensions:
        return None
    duration = max(_coerce_int(_extract_template_raw_value(template, "duration"), default=5), 1)
    enable_audio = _coerce_bool(_extract_template_raw_value(template, "enable_audio"))
    width, height = dimensions
    tokens = (Decimal(width) * Decimal(height) * SEEDANCE_FPS * Decimal(duration)) / Decimal("1024")
    rate_map = {
        "seedance 1.5 pro": Decimal("16") if enable_audio else Decimal("8"),
        "seedance 1.0 pro": Decimal("15") if enable_audio else Decimal("7.5"),
    }
    rate_per_million = rate_map.get(model_key)
    if rate_per_million is None:
        return None
    return (tokens / MILLION) * rate_per_million


def _calculate_kling_video_cost_price(model_key: str, template: dict[str, Any] | None) -> Decimal | None:
    duration = max(_coerce_int(_extract_template_raw_value(template, "duration"), default=5), 1)
    enable_audio = _coerce_bool(_extract_template_raw_value(template, "enable_audio"))
    first_frame_field = _get_template_field(template, "first_frame_image")
    has_reference_video = _contains_video_file(first_frame_field)
    if model_key == "kling o1":
        if has_reference_video:
            unit_price = Decimal("0.9")
        else:
            unit_price = Decimal("0.8") if enable_audio else Decimal("0.6")
        return unit_price * duration
    if model_key in {"kling o3", "kling v3"}:
        if has_reference_video:
            unit_price = Decimal("1.2")
        else:
            unit_price = Decimal("1.0") if enable_audio else Decimal("0.8")
        return unit_price * duration
    return None


def _calculate_vidu_q3_cost_price(template: dict[str, Any] | None) -> Decimal | None:
    resolution = _normalize_video_resolution(_extract_template_raw_value(template, "resolution"))
    duration = max(_coerce_int(_extract_template_raw_value(template, "duration"), default=4), 1)
    rate_map = {
        "1080p": Decimal("1.0"),
        "720p": Decimal("0.9375"),
        "540p": Decimal("0.4375"),
    }
    rate = rate_map.get(resolution)
    if rate is None:
        return None
    return rate * duration


def _calculate_vidu_q2_cost_price(template: dict[str, Any] | None) -> Decimal | None:
    resolution = _normalize_video_resolution(_extract_template_raw_value(template, "resolution"))
    duration = max(_coerce_int(_extract_template_raw_value(template, "duration"), default=1), 1)
    first_frame_field = _get_template_field(template, "first_frame_image")
    last_frame_field = _get_template_field(template, "last_frame_image")
    has_reference_video = _contains_video_file(first_frame_field)
    has_last_frame = _has_file_entries(last_frame_field)
    enable_audio = _coerce_bool(_extract_template_raw_value(template, "enable_audio"))

    if has_reference_video:
        base_map = {
            "540p": (Decimal("0.625"), Decimal("0.15625")),
            "720p": (Decimal("0.9375"), Decimal("0.15625")),
            "1080p": (Decimal("2.65625"), Decimal("0.3125")),
        }
    elif has_last_frame or _has_file_entries(first_frame_field):
        base_map = {
            "540p": (Decimal("0.25"), Decimal("0.15625")),
            "720p": (Decimal("0.46875"), Decimal("0.3125")),
            "1080p": (Decimal("1.71875"), Decimal("0.46875")),
        }
    else:
        return None

    rates = base_map.get(resolution)
    if rates is None:
        return None
    first_second_price, additional_second_price = rates
    if not has_reference_video and resolution == "540p":
        if duration == 1:
            total = first_second_price
        elif duration == 2:
            total = Decimal("0.3125")
        else:
            total = Decimal("0.3125") + (Decimal(duration - 2) * additional_second_price)
    else:
        total = first_second_price + (max(duration - 1, 0) * additional_second_price)
    if enable_audio:
        total += Decimal("0.46875")
    return total


def _calculate_video_cost_price(component_key: str, model_key: str, template: dict[str, Any] | None) -> Decimal | None:
    if component_key != "DoubaoVideoGenerator":
        return None
    if model_key in {"seedance 1.5 pro", "seedance 1.0 pro"}:
        return _calculate_seedance_cost_price(model_key, template)
    if model_key in {"kling o1", "kling o3", "kling v3"}:
        return _calculate_kling_video_cost_price(model_key, template)
    if model_key == "viduq3-pro":
        return _calculate_vidu_q3_cost_price(template)
    if model_key == "viduq2-pro":
        return _calculate_vidu_q2_cost_price(template)
    return None


def _calculate_text_cost_price(
    component_key: str,
    model_key: str,
    usage_sources: list[Any] | None,
) -> Decimal | None:
    if component_key != "TextCreation":
        return None
    if model_key == "gemini-3-pro-preview":
        return Decimal("0.04")
    if model_key == "gemini-3-flash-preview":
        return Decimal("0.03")
    if model_key not in {"deepseek-chat", "deepseek-reasoner"}:
        return None

    usage_payload = _find_usage_payload(usage_sources)
    if not usage_payload:
        return Decimal("0")

    prompt_tokens = _extract_usage_int(
        usage_payload,
        ("prompt_tokens",),
        ("input_tokens",),
        ("promptTokenCount",),
        ("usageMetadata", "promptTokenCount"),
    ) or 0
    completion_tokens = _extract_usage_int(
        usage_payload,
        ("completion_tokens",),
        ("output_tokens",),
        ("candidatesTokenCount",),
        ("usageMetadata", "candidatesTokenCount"),
    ) or 0
    cached_input_tokens = _extract_usage_int(
        usage_payload,
        ("prompt_cache_hit_tokens",),
        ("cache_hit_tokens",),
        ("cached_tokens",),
        ("prompt_tokens_details", "cached_tokens"),
        ("input_tokens_details", "cached_tokens"),
        ("usageMetadata", "cachedTokenCount"),
    ) or 0
    explicit_uncached_input_tokens = _extract_usage_int(
        usage_payload,
        ("prompt_cache_miss_tokens",),
        ("cache_miss_tokens",),
    )
    uncached_input_tokens = (
        explicit_uncached_input_tokens
        if explicit_uncached_input_tokens is not None
        else max(prompt_tokens - cached_input_tokens, 0)
    )
    return (
        (Decimal(cached_input_tokens) / MILLION) * Decimal("0.2")
        + (Decimal(uncached_input_tokens) / MILLION) * Decimal("2")
        + (Decimal(completion_tokens) / MILLION) * Decimal("3")
    )


def calculate_formula_credits_cost(
    component_key: str,
    model_key: str,
    template: dict[str, Any] | None,
    *,
    usage_sources: list[Any] | None = None,
) -> int | None:
    cost_price = _calculate_image_cost_price(component_key, model_key, template)
    if cost_price is None:
        cost_price = _calculate_video_cost_price(component_key, model_key, template)
    if cost_price is None:
        cost_price = _calculate_text_cost_price(component_key, model_key, usage_sources)
    if cost_price is None:
        return None
    if component_key == "TextCreation" and model_key in {"gemini-3-pro-preview", "gemini-3-flash-preview"}:
        return convert_gemini_cost_price_to_credits(cost_price)
    return convert_cost_price_to_credits(cost_price)


def is_usage_billed_text_model(component_key: str, model_key: str) -> bool:
    return component_key == "TextCreation" and model_key in {"deepseek-chat", "deepseek-reasoner"}


def get_default_display_name(component_key: str, model_key: str) -> str:
    default_rule = DEFAULT_PRICING_RULE_INDEX.get((component_key, model_key))
    if default_rule:
        return default_rule[3]
    return model_key


def extract_chargeable_component_context(
    node_payload: dict | None,
    *,
    fallback_vertex_id: str = "",
) -> tuple[str, dict[str, Any] | None, str | None]:
    if not isinstance(node_payload, dict):
        component_key = get_component_key_from_vertex_id(fallback_vertex_id) if fallback_vertex_id else ""
        return component_key, None, None

    node_data = node_payload.get("data")
    if isinstance(node_data, dict):
        component_key = str(node_data.get("type") or get_component_key_from_vertex_id(fallback_vertex_id))
        template = None
        nested_node = node_data.get("node")
        if isinstance(nested_node, dict):
            template = nested_node.get("template")
        if template is None:
            template = node_data.get("template")
        return component_key, template if isinstance(template, dict) else None, _extract_template_value(template, "model_name")

    component_key = str(node_payload.get("type") or get_component_key_from_vertex_id(fallback_vertex_id))
    template = node_payload.get("template")
    return component_key, template if isinstance(template, dict) else None, _extract_template_value(template, "model_name")


def extract_chargeable_component_data(
    node_payload: dict | None,
    *,
    fallback_vertex_id: str = "",
) -> tuple[str, str | None]:
    component_key, _template, model_name = extract_chargeable_component_context(
        node_payload,
        fallback_vertex_id=fallback_vertex_id,
    )
    return component_key, model_name


async def ensure_default_pricing_rules(session: AsyncSession) -> None:
    existing_rules = (await session.exec(select(CreditPricingRule))).all()
    existing_rule_map = {(rule.component_key, rule.model_key): rule for rule in existing_rules}

    missing_rules = [
        CreditPricingRule(
            resource_type=resource_type,
            component_key=component_key,
            model_key=model_key,
            display_name=display_name,
            credits_cost=credits_cost,
            is_active=True,
        )
        for resource_type, component_key, model_key, display_name, credits_cost in DEFAULT_PRICING_RULES
        if (component_key, model_key) not in existing_rule_map
    ]

    legacy_default_costs = {DEFAULT_IMAGE_CREDITS_COST, DEFAULT_VIDEO_CREDITS_COST}
    updated_existing = False
    for resource_type, component_key, model_key, display_name, credits_cost in DEFAULT_PRICING_RULES:
        existing_rule = existing_rule_map.get((component_key, model_key))
        if not existing_rule:
            continue
        rule_changed = False
        if existing_rule.resource_type != resource_type:
            existing_rule.resource_type = resource_type
            rule_changed = True
        if existing_rule.display_name != display_name:
            existing_rule.display_name = display_name
            rule_changed = True
        if existing_rule.credits_cost in legacy_default_costs and existing_rule.credits_cost != credits_cost:
            existing_rule.credits_cost = credits_cost
            rule_changed = True
        if rule_changed:
            updated_existing = True
            existing_rule.updated_at = utc_now()
            session.add(existing_rule)

    if not missing_rules:
        if updated_existing:
            await session.commit()
        return
    session.add_all(missing_rules)
    await session.commit()


async def get_pricing_rules(session: AsyncSession) -> list[CreditPricingRule]:
    await ensure_default_pricing_rules(session)
    return (
        await session.exec(
            select(CreditPricingRule).order_by(CreditPricingRule.resource_type, CreditPricingRule.display_name)
        )
    ).all()


async def get_or_create_credit_account(session: AsyncSession, user_id: UUID) -> CreditAccount:
    account = (await session.exec(select(CreditAccount).where(CreditAccount.user_id == user_id))).first()
    if account:
        return account

    account = CreditAccount(
        user_id=user_id,
        balance=DEFAULT_INITIAL_CREDITS,
        total_recharged=DEFAULT_INITIAL_CREDITS,
        total_consumed=0,
    )
    session.add(account)
    await session.flush()
    session.add(
        CreditLedgerEntry(
            account_id=account.id,
            user_id=user_id,
            delta=DEFAULT_INITIAL_CREDITS,
            balance_after=DEFAULT_INITIAL_CREDITS,
            entry_type=CreditLedgerEntryType.INITIAL_GRANT,
            remark="Initial credits",
        )
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        account = (await session.exec(select(CreditAccount).where(CreditAccount.user_id == user_id))).first()
        if account:
            return account
        raise
    await session.refresh(account)
    return account


async def list_credit_ledger(
    session: AsyncSession,
    *,
    user_id: UUID,
    limit: int = 50,
) -> list[CreditLedgerEntry]:
    await get_or_create_credit_account(session, user_id)
    return (
        await session.exec(
            select(CreditLedgerEntry)
            .where(CreditLedgerEntry.user_id == user_id)
            .order_by(CreditLedgerEntry.created_at.desc())
            .limit(limit)
        )
    ).all()


async def list_admin_credit_users(
    session: AsyncSession,
    *,
    skip: int = 0,
    limit: int = 20,
    search: str = "",
) -> tuple[int, list[tuple[User, CreditAccount]]]:
    users = (await session.exec(select(User))).all()
    for user in users:
        await get_or_create_credit_account(session, user.id)

    query = select(User, CreditAccount).join(CreditAccount, CreditAccount.user_id == User.id).order_by(User.create_at.desc())
    total_count_query = select(func.count()).select_from(User).join(CreditAccount, CreditAccount.user_id == User.id)
    normalized_search = search.strip().lower()
    if normalized_search:
        like_term = f"%{normalized_search}%"
        filter_condition = or_(
            func.lower(User.username).like(like_term),
            func.lower(User.nickname).like(like_term),
        )
        query = query.where(filter_condition)
        total_count_query = total_count_query.where(filter_condition)

    total_count = int((await session.exec(total_count_query)).one())
    rows = (await session.exec(query.offset(skip).limit(limit))).all()
    return total_count, rows


async def adjust_user_credits(
    session: AsyncSession,
    *,
    target_user_id: UUID,
    admin_user_id: UUID,
    amount: int,
    remark: str,
) -> CreditLedgerEntry:
    if amount == 0:
        raise HTTPException(status_code=400, detail="Adjustment amount cannot be 0")
    if not remark.strip():
        raise HTTPException(status_code=400, detail="Adjustment remark is required")

    account = await get_or_create_credit_account(session, target_user_id)
    next_balance = account.balance + amount
    if next_balance < 0:
        raise HTTPException(status_code=400, detail="Credit balance cannot go below 0")

    account.balance = next_balance
    if amount > 0:
        account.total_recharged += amount
    else:
        account.total_consumed += abs(amount)
    account.updated_at = utc_now()

    entry = CreditLedgerEntry(
        account_id=account.id,
        user_id=target_user_id,
        delta=amount,
        balance_after=next_balance,
        entry_type=CreditLedgerEntryType.MANUAL_ADJUSTMENT,
        remark=remark.strip(),
        created_by_id=admin_user_id,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


async def update_pricing_rule(
    session: AsyncSession,
    *,
    rule_id: UUID,
    credits_cost: int | None = None,
    is_active: bool | None = None,
    display_name: str | None = None,
) -> CreditPricingRule:
    rule = await session.get(CreditPricingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Pricing rule not found")
    if credits_cost is not None:
        if credits_cost < 0:
            raise HTTPException(status_code=400, detail="credits_cost cannot be negative")
        rule.credits_cost = credits_cost
    if is_active is not None:
        rule.is_active = is_active
    if display_name is not None and display_name.strip():
        rule.display_name = display_name.strip()
    rule.updated_at = utc_now()
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


async def resolve_pricing_rule(
    session: AsyncSession,
    *,
    component_key: str,
    model_key: str,
) -> CreditPricingRule | None:
    await ensure_default_pricing_rules(session)
    return (
        await session.exec(
            select(CreditPricingRule).where(
                CreditPricingRule.component_key == component_key,
                CreditPricingRule.model_key == model_key,
                CreditPricingRule.is_active == True,  # noqa: E712
            )
        )
    ).first()


async def resolve_chargeable_build_item(
    session: AsyncSession,
    *,
    node_payload: dict | None,
    vertex_id: str = "",
    usage_sources: list[Any] | None = None,
) -> ChargeableBuildItem | None:
    component_key, resource_type, model_key = extract_chargeable_item_from_node(node_payload, vertex_id=vertex_id)
    if not resource_type or not model_key:
        return None

    _component_key, template, _raw_model_name = extract_chargeable_component_context(
        node_payload,
        fallback_vertex_id=vertex_id,
    )
    formula_credits_cost = calculate_formula_credits_cost(
        component_key,
        model_key,
        template,
        usage_sources=usage_sources,
    )
    pricing_rule = await resolve_pricing_rule(session, component_key=component_key, model_key=model_key)

    if formula_credits_cost is None:
        if not pricing_rule:
            return None
        credits_cost = pricing_rule.credits_cost
    else:
        credits_cost = formula_credits_cost

    display_name = pricing_rule.display_name if pricing_rule else get_default_display_name(component_key, model_key)
    return ChargeableBuildItem(
        vertex_id=vertex_id,
        component_key=component_key,
        resource_type=resource_type,
        model_key=model_key,
        display_name=display_name,
        credits_cost=credits_cost,
    )


async def estimate_chargeable_build_item(
    session: AsyncSession,
    *,
    node_payload: dict | None,
    vertex_id: str = "",
) -> CreditEstimate:
    component_key, resource_type, model_key = extract_chargeable_item_from_node(node_payload, vertex_id=vertex_id)
    if not resource_type or not model_key:
        return CreditEstimate(
            component_key=component_key,
            resource_type=resource_type,
            model_key=model_key,
            display_name=None,
            billing_mode="unavailable",
            estimated_credits=None,
        )

    _component_key, template, _raw_model_name = extract_chargeable_component_context(
        node_payload,
        fallback_vertex_id=vertex_id,
    )
    pricing_rule = await resolve_pricing_rule(session, component_key=component_key, model_key=model_key)
    display_name = pricing_rule.display_name if pricing_rule else get_default_display_name(component_key, model_key)

    if is_usage_billed_text_model(component_key, model_key):
        return CreditEstimate(
            component_key=component_key,
            resource_type=resource_type,
            model_key=model_key,
            display_name=display_name,
            billing_mode="usage_based",
            estimated_credits=None,
        )

    formula_credits_cost = calculate_formula_credits_cost(
        component_key,
        model_key,
        template,
    )
    if formula_credits_cost is not None:
        return CreditEstimate(
            component_key=component_key,
            resource_type=resource_type,
            model_key=model_key,
            display_name=display_name,
            billing_mode="estimated",
            estimated_credits=formula_credits_cost,
        )

    if pricing_rule:
        return CreditEstimate(
            component_key=component_key,
            resource_type=resource_type,
            model_key=model_key,
            display_name=display_name,
            billing_mode="estimated",
            estimated_credits=pricing_rule.credits_cost,
        )

    return CreditEstimate(
        component_key=component_key,
        resource_type=resource_type,
        model_key=model_key,
        display_name=display_name,
        billing_mode="unavailable",
        estimated_credits=None,
    )


def extract_chargeable_item_from_node(
    node_payload: dict | None,
    *,
    vertex_id: str = "",
) -> tuple[str, CreditResourceType | None, str | None]:
    component_key, _template, raw_model_name = extract_chargeable_component_context(
        node_payload,
        fallback_vertex_id=vertex_id,
    )
    resource_type = CHARGEABLE_COMPONENT_RESOURCE_TYPES.get(component_key)
    if not resource_type:
        return component_key, None, None
    model_key = normalize_model_name(raw_model_name)
    return component_key, resource_type, model_key or None


async def collect_chargeable_items_from_flow_data(
    session: AsyncSession,
    *,
    flow_data: dict | None,
    planned_vertex_ids: list[str] | None = None,
) -> list[ChargeableBuildItem]:
    nodes = flow_data.get("nodes", []) if isinstance(flow_data, dict) else []
    planned_vertex_ids_set = set(planned_vertex_ids or [])
    items: list[ChargeableBuildItem] = []

    for node in nodes:
        if not isinstance(node, dict):
            continue
        vertex_id = str(node.get("id") or "")
        if planned_vertex_ids_set and vertex_id not in planned_vertex_ids_set:
            continue
        item = await resolve_chargeable_build_item(
            session,
            node_payload=node,
            vertex_id=vertex_id,
        )
        if not item or item.credits_cost <= 0:
            continue
        items.append(item)
    return items


async def ensure_sufficient_balance_for_items(
    session: AsyncSession,
    *,
    user_id: UUID,
    items: list[ChargeableBuildItem],
) -> CreditBalanceCheck:
    account = await get_or_create_credit_account(session, user_id)
    total_required = sum(item.credits_cost for item in items)
    if total_required > account.balance:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "INSUFFICIENT_CREDITS",
                "message": "Insufficient credits",
                "current_balance": account.balance,
                "required_credits": total_required,
                "shortage": total_required - account.balance,
                "items": [
                    {
                        "vertex_id": item.vertex_id,
                        "component_key": item.component_key,
                        "model_key": item.model_key,
                        "credits_cost": item.credits_cost,
                    }
                    for item in items
                ],
            },
        )
    return CreditBalanceCheck(account=account, items=items, total_required=total_required)


async def apply_usage_charge(
    session: AsyncSession,
    *,
    user_id: UUID,
    flow_id: UUID,
    run_id: str,
    vertex_id: str,
    component_key: str,
    resource_type: CreditResourceType,
    model_key: str,
    credits_cost: int,
) -> CreditLedgerEntry | None:
    if credits_cost <= 0:
        return None

    dedupe_key = f"usage:{run_id}:{vertex_id}"
    existing_entry = (await session.exec(select(CreditLedgerEntry).where(CreditLedgerEntry.dedupe_key == dedupe_key))).first()
    if existing_entry:
        return existing_entry

    account = await get_or_create_credit_account(session, user_id)
    if account.balance < credits_cost:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CREDITS_CHARGE_CONFLICT",
                "message": "Credit balance changed before charge could be applied",
                "current_balance": account.balance,
                "required_credits": credits_cost,
            },
        )

    account.balance -= credits_cost
    account.total_consumed += credits_cost
    account.updated_at = utc_now()

    entry = CreditLedgerEntry(
        account_id=account.id,
        user_id=user_id,
        delta=-credits_cost,
        balance_after=account.balance,
        entry_type=CreditLedgerEntryType.USAGE_CHARGE,
        resource_type=resource_type,
        component_key=component_key,
        model_key=model_key,
        flow_id=flow_id,
        run_id=run_id,
        vertex_id=vertex_id,
        dedupe_key=dedupe_key,
        remark=f"{component_key}:{model_key}",
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry
