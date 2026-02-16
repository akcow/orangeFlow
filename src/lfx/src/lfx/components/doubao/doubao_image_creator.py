"""即梦图片创作 LFX 组件"""

from __future__ import annotations

import base64
import io
import json
import inspect
import mimetypes
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from typing import Any
from uuid import uuid4

import requests
from dotenv import load_dotenv

try:
    from volcenginesdkarkruntime import Ark  # type: ignore
except Exception:  # noqa: BLE001
    Ark = None  # type: ignore[assignment]

try:
    from volcenginesdkarkruntime.types.images.images import (  # type: ignore
        SequentialImageGenerationOptions,
    )
except Exception:  # noqa: BLE001
    SequentialImageGenerationOptions = None  # type: ignore[assignment]


from lfx.custom.custom_component.component import Component
from lfx.field_typing.range_spec import RangeSpec
from lfx.inputs.inputs import (
    BoolInput,
    DataInput,
    DropdownInput,
    FileInput,
    FloatInput,
    IntInput,
    MultilineInput,
    SecretStrInput,
    StrInput,
)
from lfx.components.doubao.shared_credentials import resolve_credentials
from lfx.utils.provider_credentials import get_provider_credentials
from lfx.schema.data import Data
from lfx.template.field.base import Output

load_dotenv()


class DoubaoImageCreator(Component):
    """整合多种图片创作模型，支持文生图、图生图与组图输出的统一节点。"""

    display_name = "图片创作"
    description = ""
    icon = "DoubaoImageCreator"
    name = "DoubaoImageCreator"

    MODEL_CATALOG = {
        "Seedream 4.5 · 旗舰 (251128)": {
            "model_id": "doubao-seedream-4-5-251128",
            "min_area": 3_686_400,
            "max_area": 16_777_216,
        },
        "Seedream 4.0 · 灵动 (250828)": {
            "model_id": "doubao-seedream-4-0-250828",
            "min_area": 921_600,
            "max_area": 16_777_216,
        },
        "Nano Banana": {
            "provider": "gemini",
            "model_id": "gemini-2.5-flash-image",
            "max_reference_images": 3,
            "supports_image_size": False,
            "supports_multi_turn": False,
            "supports_google_search": False,
        },
        "Nano Banana Pro": {
            "provider": "gemini",
            "model_id": "gemini-3-pro-image-preview",
            "max_reference_images": 14,
            "max_high_fidelity_reference_images": 5,
            "supports_image_size": True,
            "supports_multi_turn": True,
            "supports_google_search": True,
        },
        "wan2.6": {
            "t2i_model": "wan2.6-t2i",
            "i2i_model": "wan2.6-image",
            "supports_sync": True,
            "t2i_min_area": 1280 * 1280,
            "t2i_max_area": 1440 * 1440,
            "i2i_min_area": 768 * 768,
            "i2i_max_area": 1280 * 1280,
            "max_reference_images": 4,
        },
        "wan2.5": {
            "t2i_model": "wan2.5-t2i-preview",
            "i2i_model": "wan2.5-i2i-preview",
            "supports_sync": False,
            "t2i_min_area": 1280 * 1280,
            "t2i_max_area": 1440 * 1440,
            "i2i_min_area": 768 * 768,
            "i2i_max_area": 1280 * 1280,
            "max_reference_images": 4,
        },
        "kling O1": {
            "provider": "kling",
            "model_id": "kling-image-o1",
            # Official docs: image_list + element_list <= 10
            "max_reference_images": 10,
            "supports_image_size": False,
        },
        "千问-图像编辑 · Max": {
            "provider": "dashscope",
            "model_id": "qwen-image-edit-max",
            # Official: supports 1-3 input images.
            "max_reference_images": 3,
            # Output count supports 1-6 (handled by image_count constraint elsewhere).
            # Tool-only model: used by UI tools (e.g. multi-angle camera) via hidden overrides.
            # Do not expose this in the regular "图片创作" model dropdown.
            "tool_only": True,
        },
    }

    # Hide tool-only models from the user-facing dropdown.
    MODEL_OPTIONS = [k for k, meta in MODEL_CATALOG.items() if not (meta or {}).get("tool_only")]

    RESOLUTION_PRESETS = {
        "1K（草稿）": 1280,
        "2K（推荐）": 2048,
        "4K（超清）": 4096,
    }

    ASPECT_RATIOS = {
        "1:1": (1, 1),
        "4:3": (4, 3),
        "3:4": (3, 4),
        "16:9": (16, 9),
        "9:16": (9, 16),
        "3:2": (3, 2),
        "2:3": (2, 3),
        "adaptive": (1, 1),
    }

    MAX_REFERENCE_IMAGES = 14
    MAX_REFERENCE_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    PREVIEW_MAX_BYTES = 6 * 1024 * 1024
    PREVIEW_TIMEOUT = 20
    DASHSCOPE_API_BASE = "https://dashscope.aliyuncs.com"
    DASHSCOPE_ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "bmp", "webp"}
    DASHSCOPE_POLL_INTERVAL_SECONDS = 2.0
    # 国内代理地址（与文本创作组件保持一致）
    GEMINI_API_BASE = "https://new.12ai.org/v1beta"
    GEMINI_ENV_ENABLE_MULTI_TURN = "GEMINI_ENABLE_MULTI_TURN"
    GEMINI_ENV_MAX_TURNS = "GEMINI_MULTI_TURN_MAX_TURNS"
    GEMINI_ENV_ENABLE_GOOGLE_SEARCH = "GEMINI_ENABLE_GOOGLE_SEARCH"

    inputs = [
        DropdownInput(
            name="model_name",
            display_name="模型选择",
            options=MODEL_OPTIONS,
            value="Seedream 4.5 · 旗舰 (251128)",
            required=True,
            real_time_refresh=True,
            refresh_button=False,
            info="选择即梦模型：4.5 画质更高，4.0 更兼容 fast 模式及轻量场景。",
        ),
        MultilineInput(
            name="prompt",
            display_name="提示词输入",
            required=False,
            value="",
            placeholder="示例：充满电影感的城市夜景，霓虹灯反射，主角穿着未来主义机甲。",
            info="支持中文/英文，亦可通过上游节点传入 Message/Data/Text。",
            input_types=["Message", "Data", "Text"],
        ),
        MultilineInput(
            name="negative_prompt",
            display_name="反向提示词",
            required=False,
            value="",
            advanced=True,
            info="wan/dashscope 模型可选：不希望在图像中出现的内容。",
        ),
        IntInput(
            name="seed",
            display_name="Seed",
            required=False,
            value=0,
            advanced=True,
            info="wan/dashscope 模型可选：随机种子（0 表示不传）。",
        ),
        BoolInput(
            name="prompt_extend",
            display_name="Prompt Extend",
            value=True,
            advanced=True,
            info="wan/dashscope 模型可选：提示词智能改写。",
        ),
        BoolInput(
            name="watermark",
            display_name="Watermark",
            value=False,
            advanced=True,
            info="wan/dashscope 模型可选：添加“AI生成”水印。",
        ),
        SecretStrInput(
            name="ak",
            display_name="AK (Optional)",
            value="",
            advanced=True,
            required=False,
            load_from_db=False,
            info="可选：使用 AK/SK 鉴权（如你不是使用 API Key）。",
        ),
        SecretStrInput(
            name="sk",
            display_name="SK (Optional)",
            value="",
            advanced=True,
            required=False,
            load_from_db=False,
            info="可选：使用 AK/SK 鉴权（如你不是使用 API Key）。",
        ),
        StrInput(
            name="api_base",
            display_name="API Base",
            value="https://ark.cn-beijing.volces.com/api/v3",
            advanced=True,
            info="Ark API 基础地址，默认官方地址。网络/代理环境特殊时可调整。",
        ),
        StrInput(
            name="region",
            display_name="Region",
            value="cn-beijing",
            advanced=True,
            info="Ark 区域，默认 cn-beijing。",
        ),
        IntInput(
            name="max_retries",
            display_name="Max Retries",
            value=2,
            advanced=True,
            info="Ark SDK 重试次数（连接不稳定时可适当增大）。",
        ),
        FloatInput(
            name="timeout_seconds",
            display_name="Timeout Seconds",
            value=600.0,
            advanced=True,
            info="请求超时时间（秒）。注意连接超时与读取超时均受此值影响。",
        ),
        DataInput(
            name="draft_output",
            display_name="预览缓存",
            show=False,
            required=False,
            value={},
        ),
        # Internal tool routing (hidden): used by UI tools like Multi-Angle 3D Camera.
        StrInput(
            name="tool_model_override",
            display_name="Tool Model Override",
            value="",
            advanced=True,
            show=False,
            required=False,
            info="Internal: override the upstream model id for tool-driven runs (hidden).",
        ),
        StrInput(
            name="tool_size_override",
            display_name="Tool Size Override",
            value="",
            advanced=True,
            show=False,
            required=False,
            info="Internal: override output image size for tool-driven runs (hidden). Format: '1024*1024'.",
        ),
        StrInput(
            name="tool_multi_angle_views",
            display_name="Tool Multi-Angle Views",
            value="",
            advanced=True,
            show=False,
            required=False,
            info="Internal: JSON payload for multi-angle camera views (hidden).",
        ),
        StrInput(
            name="tool_enhance_resolution",
            display_name="Tool Enhance Resolution",
            value="4k",
            advanced=True,
            show=False,
            required=False,
            info="Internal: Jimeng enhance output resolution (hidden). Values: 4k/8k.",
        ),
        IntInput(
            name="tool_enhance_scale",
            display_name="Tool Enhance Scale",
            value=50,
            advanced=True,
            show=False,
            required=False,
            info="Internal: Jimeng enhance detail scale (hidden). Range: 0-100.",
        ),
        BoolInput(
            name="enable_multi_turn",
            display_name="多轮对话",
            value=False,
            advanced=True,
            info=(
                "仅 Nano Banana Pro 支持。启用后会把上一轮的 user/model content 保存为 history，"
                "下一轮请求会携带这些历史。默认只保留最近 4 轮（可用环境变量 GEMINI_MULTI_TURN_MAX_TURNS 修改）。"
            ),
        ),
        BoolInput(
            name="enable_google_search",
            display_name="联网搜索",
            value=False,
            advanced=True,
            info=(
                "仅 Nano Banana Pro 支持。启用后会在 generateContent payload 中添加 tools=[{google_search:{}}]。"
                "注意：一些代理/网关可能不支持；启用后会自动设置 responseModalities=[\"TEXT\",\"IMAGE\"]。"
            ),
        ),
        DropdownInput(
            name="resolution",
            display_name="图像分辨率",
            options=list(RESOLUTION_PRESETS.keys()),
            value="2K（推荐）",
            info="决定输出的清晰度，4K 耗时/费用更高；1K 适合快速草稿。",
        ),
        DropdownInput(
            name="aspect_ratio",
            display_name="图像比例",
            options=list(ASPECT_RATIOS.keys()),
            value="1:1",
            info="常用比例建议：海报 3:4、横幅 16:9、竖屏 9:16。",
        ),
        IntInput(
            name="image_count",
            display_name="生成张数",
            value=1,
            range_spec=RangeSpec(min=1, max=6, step=1),
            info="组图生成上限 6 张，超过 1 张时自动开启组图模式。",
        ),
        FileInput(
            name="reference_images",
            display_name="图片上传",
            is_list=True,
            list_add_label="继续选择图片",
            file_types=["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff"],
            input_types=["Data"],
            info=(
                "点击按钮选择 1-14 张本地参考图，系统将弹出中文指引的文件选择窗口。\n"
                "支持 png/jpg/webp/bmp/tiff/gif，单图 ≤10MB，可与上游节点联动实现图生图。"
            ),
        ),
        StrInput(
            name="kling_element_ids",
            display_name="Kling 主体ID列表",
            value="",
            advanced=True,
            show=False,
            required=False,
            info="仅 kling O1：主体库 element_id 列表（逗号分隔），用于 element_list，并可在 prompt 中用 <<<element_1>>> 引用。",
        ),
        StrInput(
            name="kling_callback_url",
            display_name="Kling Callback URL",
            value="",
            advanced=True,
            show=False,
            required=False,
            info="仅 kling O1：任务状态回调地址（可选）。",
        ),
        StrInput(
            name="kling_external_task_id",
            display_name="Kling External Task ID",
            value="",
            advanced=True,
            show=False,
            required=False,
            info="仅 kling O1：自定义任务 ID（可选，单用户需唯一）。",
        ),
        SecretStrInput(
            name="api_key",
            display_name="API Key",
            value="",
            placeholder="留空时读取 .env 中的 ARK_API_KEY 或 DASHSCOPE_API_KEY",
            info=(
                "可选：覆盖模型所需的 API Key。\n"
                "- Doubao/Ark 模型：使用 ARK_API_KEY\n"
                "- wan/DashScope 模型：使用 DASHSCOPE_API_KEY\n"
            ),
            load_from_db=False,
        ),
    ]

    outputs = [
        Output(
            name="image",
            display_name="图片创作结果",
            method="build_images",
            types=["Data"],
        )
    ]

    def update_build_config(self, build_config, field_value: Any, field_name: str | None = None):
        """动态 UI 配置：为 kling O1 图片接入做字段禁用/约束。"""
        if field_name and field_name in build_config:
            build_config[field_name]["value"] = field_value

        try:
            model_value = str((build_config.get("model_name") or {}).get("value") or "").strip()
        except Exception:
            model_value = ""

        is_kling = model_value == "kling O1" or model_value.lower().startswith("kling")

        # Helper: restore a field back to its static definition (keeps current value).
        def _restore_field_defaults(field: str) -> None:
            current_value = (build_config.get(field) or {}).get("value")
            for inp in getattr(type(self), "inputs", []) or []:
                if getattr(inp, "name", None) == field and hasattr(inp, "to_dict"):
                    build_config[field] = inp.to_dict()
                    if current_value is not None:
                        build_config[field]["value"] = current_value
                    return

        kling_only_fields = ("kling_element_ids", "kling_callback_url", "kling_external_task_id")

        if is_kling:
            # Show Kling-only fields.
            for f in kling_only_fields:
                if f in build_config:
                    build_config[f]["show"] = True

            # Hide unrelated knobs (other providers).
            for f in (
                "negative_prompt",
                "seed",
                "prompt_extend",
                "watermark",
                "enable_multi_turn",
                "enable_google_search",
                "ak",
                "sk",
                "api_base",
                "region",
                "max_retries",
                "timeout_seconds",
                "api_key",
            ):
                if f in build_config:
                    build_config[f]["show"] = False

            # Resolution: only 1K/2K.
            if "resolution" in build_config:
                build_config["resolution"]["options"] = ["1K（草稿）", "2K（推荐）"]
                val = str(build_config["resolution"].get("value") or "2K（推荐）").strip()
                if val not in {"1K（草稿）", "2K（推荐）"}:
                    build_config["resolution"]["value"] = "2K（推荐）"
                build_config["resolution"]["info"] = "kling O1：仅支持 1k / 2k（UI 显示为 1K/2K）。"

            # Aspect ratio: keep 'adaptive' (maps to upstream 'auto') and add 21:9.
            if "aspect_ratio" in build_config:
                options = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "adaptive"]
                build_config["aspect_ratio"]["options"] = options
                build_config["aspect_ratio"]["options_metadata"] = []
                val = str(build_config["aspect_ratio"].get("value") or "adaptive").strip()
                if val not in set(options):
                    build_config["aspect_ratio"]["value"] = "adaptive"
                build_config["aspect_ratio"]["info"] = "kling O1：支持 21:9；UI 的 adaptive 会映射为上游的 auto。"

            # Image count: 1-9.
            if "image_count" in build_config:
                build_config["image_count"]["range_spec"] = {"min": 1, "max": 9, "step": 1, "step_type": "int"}
                try:
                    cnt = int(build_config["image_count"].get("value") or 1)
                except Exception:
                    cnt = 1
                build_config["image_count"]["value"] = max(1, min(cnt, 9))
                build_config["image_count"]["info"] = "kling O1：生成张数范围 1-9。"

            # Reference images: jpg/jpeg/png only.
            if "reference_images" in build_config:
                build_config["reference_images"]["file_types"] = ["jpg", "jpeg", "png"]
                build_config["reference_images"]["info"] = (
                    "仅 kling O1：支持 jpg/jpeg/png；单图 ≤10MB；参考图 + 主体数量之和 ≤10。"
                )

        else:
            # Hide Kling-only fields when switching away.
            for f in kling_only_fields:
                if f in build_config:
                    build_config[f]["show"] = False

            # Restore defaults for fields we changed.
            _restore_field_defaults("resolution")
            _restore_field_defaults("aspect_ratio")
            _restore_field_defaults("image_count")
            _restore_field_defaults("reference_images")

            # Restore visibility of common advanced fields.
            for f in (
                "negative_prompt",
                "seed",
                "prompt_extend",
                "watermark",
                "enable_multi_turn",
                "enable_google_search",
                "ak",
                "sk",
                "api_base",
                "region",
                "max_retries",
                "timeout_seconds",
                "api_key",
            ):
                if f in build_config:
                    build_config[f]["show"] = True

        return build_config

    def build_images(self) -> Data:
        prompt = self._merge_prompt(self.prompt)
        model_meta = self.MODEL_CATALOG.get(self.model_name)
        if not model_meta:
            return self._error("未匹配到可用模型，请重新选择。")

        vertex = getattr(self, "_vertex", None)
        if getattr(vertex, "frozen", False):
            draft = getattr(self, "draft_output", None)
            if isinstance(draft, Data):
                payload = draft.data
            elif isinstance(draft, dict):
                payload = draft
            else:
                payload = None
            if isinstance(payload, dict) and payload:
                if (
                    "doubao_preview" in payload
                    or "images" in payload
                    or "generated_images" in payload
                    or "image_url" in payload
                    or "image_data_url" in payload
                ):
                    payload = {**payload, "text": payload.get("text", "")}
                    self.status = "🔁 已冻结，使用缓存预览输出"
                    return Data(data=payload, type="image")

        # Note: Gemini is handled after bridge-mode checks.

        tool_override = str(getattr(self, "tool_model_override", "") or "").strip()
        if tool_override.startswith("jimeng"):
            return self._build_images_jimeng_visual_gateway(model_id=tool_override)

        provider = str(model_meta.get("provider") or "").strip().lower()
        is_kling = provider == "kling"
        is_dashscope = provider == "dashscope" or "t2i_model" in model_meta or "i2i_model" in model_meta
        if not prompt:
            uploads = getattr(self, "reference_images", None)
            if uploads:
                try:
                    max_refs = int(model_meta.get("max_reference_images") or self.MAX_REFERENCE_IMAGES)
                    payloads, metadata = self._prepare_reference_images(
                        max_reference_images=max_refs,
                        allowed_extensions=(
                            {"jpg", "jpeg", "png"}
                            if is_kling
                            else (set(self.DASHSCOPE_ALLOWED_IMAGE_EXTENSIONS) if is_dashscope else None)
                        ),
                    )
                except Exception:
                    payloads, metadata = [], []

                if payloads:
                    images_payload: list[dict[str, Any]] = []
                    for index, data_url in enumerate(payloads):
                        meta = metadata[index] if index < len(metadata) else {}
                        item: dict[str, Any] = {
                            "image_data_url": data_url,
                            "origin": "reference_images",
                            **meta,
                        }

                        source_path = meta.get("source_path") if isinstance(meta, dict) else None
                        if isinstance(source_path, str) and source_path.strip():
                            try:
                                file_path = Path(source_path)
                                if file_path.name and file_path.parent.name:
                                    item["image_url"] = f"/api/v1/files/images/{file_path.parent.name}/{file_path.name}"
                            except Exception:
                                pass

                        images_payload.append(item)

                    payload = {"images": images_payload, "source": "reference_images"}
                else:
                    raw_items = uploads if isinstance(uploads, list) else [uploads]
                    payload = {"images": raw_items, "source": "reference_images"}
            else:
                draft = getattr(self, "draft_output", None)
                if isinstance(draft, Data):
                    payload = draft.data
                elif isinstance(draft, dict):
                    payload = draft
                else:
                    payload = {}

            generated_at = datetime.now(timezone.utc).isoformat()
            payload = {
                **payload,
                "text": payload.get("text", ""),
                "bridge_mode": True,
                "doubao_preview": {
                    "token": f"{self.name}-bridge",
                    "kind": "image",
                    "available": bool(payload.get("images")),
                    "generated_at": generated_at,
                    "payload": payload,
                },
            }
            self.status = "🔁 桥梁模式：提示词为空，直通预览输出"
            return Data(data=payload, type="image")

        if tool_override.startswith("qwen-image-edit"):
            return self._build_images_qwen_image_edit_gateway(prompt=prompt, model_id=tool_override)

        # Allow selecting Qwen Image Edit from the model dropdown (not only via hidden tool override fields).
        model_id = str(model_meta.get("model_id") or "").strip()
        if model_id.startswith("qwen-image-edit"):
            return self._build_images_qwen_image_edit_gateway(prompt=prompt, model_id=model_id)

        # Hosted gateway path (server-managed credentials; no Provider Credentials UI / node keys).
        try:
            resolution = self.resolution or "2K（推荐）"
            aspect_ratio = self.aspect_ratio or "1:1"
            image_count = int(self.image_count or 1)
            image_count = max(1, min(image_count, 9 if is_kling else 6))
            size_info = (
                {
                    "label": "",
                    "size_value": "",
                    "width": 0,
                    "height": 0,
                    "ratio": aspect_ratio,
                    "base_resolution": resolution,
                }
                if is_kling
                else self._resolve_size(model_meta, resolution, aspect_ratio)
            )
            max_refs = int(model_meta.get("max_reference_images") or self.MAX_REFERENCE_IMAGES)
            reference_payloads, reference_meta = self._prepare_reference_images(
                max_reference_images=max_refs,
                allowed_extensions=(
                    {"jpg", "jpeg", "png"}
                    if is_kling
                    else (set(self.DASHSCOPE_ALLOWED_IMAGE_EXTENSIONS) if is_dashscope else None)
                ),
            )
        except ValueError as exc:
            return self._error(str(exc))

        if is_kling:
            return self._build_images_kling_gateway(
                prompt=prompt,
                model_meta=model_meta,
                resolution=resolution,
                aspect_ratio=aspect_ratio,
                image_count=image_count,
                reference_payloads=reference_payloads,
                reference_meta=reference_meta,
            )

        if model_meta.get("provider") == "gemini":
            return self._build_images_gemini_gateway(
                prompt=prompt,
                model_meta=model_meta,
                resolution=resolution,
                aspect_ratio=aspect_ratio,
                image_count=image_count,
                size_info=size_info,
                reference_payloads=reference_payloads,
                reference_meta=reference_meta,
            )

        if is_dashscope:
            return self._build_images_wan_gateway(
                prompt=prompt,
                model_meta=model_meta,
                resolution=resolution,
                aspect_ratio=aspect_ratio,
                image_count=image_count,
                size_info=size_info,
                reference_payloads=reference_payloads,
                reference_meta=reference_meta,
            )

        return self._build_images_doubao_gateway(
            prompt=prompt,
            model_meta=model_meta,
            resolution=resolution,
            aspect_ratio=aspect_ratio,
            image_count=image_count,
            size_info=size_info,
            reference_payloads=reference_payloads,
            reference_meta=reference_meta,
        )

    def _resolve_qwen_edit_size(self, *, resolution: str, aspect_ratio: str) -> str | None:
        """Best-effort size mapping for qwen-image-edit-* (width/height in [512, 2048])."""
        ratio_key = str(aspect_ratio or "").strip()
        if not ratio_key or ratio_key.lower() in {"adaptive", "auto"}:
            return None

        ratio = self.ASPECT_RATIOS.get(ratio_key)
        if not ratio:
            return None

        base = int(self.RESOLUTION_PRESETS.get(str(resolution or "").strip(), 2048))
        base = max(512, min(base, 2048))

        w_ratio, h_ratio = ratio
        if not w_ratio or not h_ratio:
            return None

        r = float(w_ratio) / float(h_ratio)
        if r >= 1:
            width = base
            height = int(round(base / r))
        else:
            height = base
            width = int(round(base * r))

        width = max(512, min(width, 2048))
        height = max(512, min(height, 2048))

        # DashScope examples use "*" in size.
        return f"{width}*{height}"

    @staticmethod
    def _parse_size_override(value: str | None) -> tuple[int, int] | None:
        """Parse 'W*H' or 'WxH' into (W, H)."""
        raw = str(value or "").strip().lower().replace("×", "*").replace("x", "*")
        if not raw:
            return None
        if "*" not in raw:
            return None
        left, right = raw.split("*", 1)
        try:
            w = int(float(left.strip()))
            h = int(float(right.strip()))
        except Exception:
            return None
        if w <= 0 or h <= 0:
            return None
        return w, h

    @staticmethod
    def _clamp_size_to_qwen_limits(width: int, height: int) -> tuple[int, int]:
        """Clamp/scale to Qwen Image Edit size constraints: each dim in [512, 2048]."""
        w = int(width)
        h = int(height)
        if w <= 0 or h <= 0:
            return 1024, 1024

        # Scale down if any dimension exceeds max.
        max_dim = 2048
        min_dim = 512
        scale_down = min(max_dim / w, max_dim / h, 1.0)
        w = int(round(w * scale_down))
        h = int(round(h * scale_down))

        # Scale up if both dimensions are below min.
        if w < min_dim and h < min_dim:
            scale_up = max(min_dim / max(w, 1), min_dim / max(h, 1))
            w = int(round(w * scale_up))
            h = int(round(h * scale_up))

        w = max(min_dim, min(w, max_dim))
        h = max(min_dim, min(h, max_dim))
        return w, h

    def _build_images_jimeng_visual_gateway(self, *, model_id: str) -> Data:
        """Jimeng Visual CV APIs (e.g. 智能超清) via hosted gateway."""
        try:
            from langflow.gateway.client import images_generations

            # Service constraints from docs/model/即梦智能超清接口文档.md
            max_input_bytes = 4_700_000

            resolution = str(getattr(self, "tool_enhance_resolution", "") or "4k").strip().lower()
            if resolution not in {"4k", "8k"}:
                resolution = "4k"

            try:
                scale = int(getattr(self, "tool_enhance_scale", 50) or 50)
            except Exception:
                scale = 50
            scale = max(0, min(100, scale))

            reference_payloads, reference_meta = self._prepare_reference_images(
                max_reference_images=1,
                allowed_extensions={"jpg", "jpeg", "png"},
            )
            if not reference_payloads:
                return self._error("增强需要 1 张 JPEG/PNG 参考图。")

            meta0 = reference_meta[0] if reference_meta else {}
            try:
                size_bytes = int(meta0.get("size_bytes") or 0) if isinstance(meta0, dict) else 0
            except Exception:
                size_bytes = 0
            if size_bytes and size_bytes > max_input_bytes:
                return self._error("输入图片超过 4.7MB，上游服务可能拒绝处理。请换更小的图片或压缩后重试。")

            data_url = str(reference_payloads[0] or "").strip()
            if not data_url:
                return self._error("未读取到参考图数据。")
            if data_url.startswith("data:") and "base64," in data_url:
                b64 = data_url.split("base64,", 1)[1].strip()
            else:
                # Also accept raw base64 (fallback).
                b64 = data_url.strip()

            # Gateway provider maps model_id -> req_key; we only send image + knobs.
            response = images_generations(
                model=str(model_id),
                prompt="",
                n=1,
                response_format="url",
                extra_body={
                    "binary_data_base64": [b64],
                    "resolution": resolution,
                    "scale": scale,
                },
                user_id=str(getattr(self, "user_id", "") or "") or None,
            )

            data_list = (response or {}).get("data") or []
            if not isinstance(data_list, list) or not data_list:
                return self._error(f"Gateway returned no images: {response}")
            first = data_list[0] if isinstance(data_list[0], dict) else {}
            image_url = first.get("url") or first.get("image_url")
            if not isinstance(image_url, str) or not image_url.strip():
                return self._error(f"Gateway returned invalid image url: {response}")
            image_url = image_url.strip()

            preview_data, preview_error = self._download_preview(image_url)
            images: list[dict[str, Any]] = [
                {
                    "index": 0,
                    "image_url": image_url,
                    **({"image_data_url": preview_data} if preview_data else {}),
                    **({"preview_error": preview_error} if preview_error else {}),
                }
            ]

            generated_at = datetime.now(timezone.utc).isoformat()
            preview_token = str((response or {}).get("id") or f"{self.name}-{uuid4().hex[:6]}")
            doubao_preview = {
                "token": preview_token,
                "kind": "image",
                "available": True,
                "generated_at": generated_at,
                "payload": {
                    "images": [
                        {
                            "index": 0,
                            "image_url": image_url,
                            "image_data_url": preview_data,
                            "resolution": resolution,
                            "scale": scale,
                        }
                    ],
                    "model": {"name": "jimeng_visual", "model_id": str(model_id)},
                    "tool": "enhance",
                    "reference_images": reference_meta,
                },
            }

            self.status = f"✅ 增强成功 ({model_id})"
            return Data(
                data={
                    "provider": "gateway",
                    "images": images,
                    "model": {"name": "jimeng_visual", "model_id": str(model_id)},
                    "resolution": resolution,
                    "scale": scale,
                    "reference_images": reference_meta,
                    "provider_response": (response or {}).get("provider_response"),
                    "doubao_preview": doubao_preview,
                },
                type="image",
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gateway jimeng-visual failed: {exc}")

    def _build_images_qwen_image_edit_gateway(self, *, prompt: str, model_id: str) -> Data:
        """Qwen Image Edit (DashScope) via hosted gateway (server-managed credentials)."""
        try:
            from langflow.gateway.client import images_generations

            resolution = self.resolution or "2K（推荐）"
            aspect_ratio = self.aspect_ratio or "adaptive"
            image_count = int(self.image_count or 1)
            image_count = max(1, min(image_count, 6))

            # Qwen Image Edit supports 1-3 input images. Our tool uses 1 by default.
            reference_payloads, reference_meta = self._prepare_reference_images(
                max_reference_images=3,
                allowed_extensions=None,
            )
            if not reference_payloads:
                return self._error("Qwen 图像编辑需要至少 1 张参考图。")

            tool_size_override = str(getattr(self, "tool_size_override", "") or "").strip()
            parsed_override = self._parse_size_override(tool_size_override)

            # Multi-angle camera: if the UI provided structured view params, iterate per view and generate
            # exactly 1 image per call. This avoids the model collapsing multiple angles into a single
            # collage/montage image.
            raw_views = str(getattr(self, "tool_multi_angle_views", "") or "").strip()
            views: list[dict[str, Any]] = []
            if raw_views:
                try:
                    parsed = json.loads(raw_views)
                    if isinstance(parsed, list):
                        views = [v for v in parsed if isinstance(v, dict)]
                except Exception:
                    views = []

            override_w = override_h = None
            if parsed_override:
                w, h = self._clamp_size_to_qwen_limits(*parsed_override)
                override_w, override_h = w, h
                size = f"{w}*{h}"
            else:
                # Keep existing behavior for non-tool runs.
                size = self._resolve_qwen_edit_size(resolution=resolution, aspect_ratio=aspect_ratio)
            extra_body: dict[str, Any] = {
                "images": reference_payloads,
                "negative_prompt": str(getattr(self, "negative_prompt", "") or ""),
                "seed": int(getattr(self, "seed", 0) or 0),
                "prompt_extend": bool(getattr(self, "prompt_extend", True)),
                "watermark": bool(getattr(self, "watermark", False)),
                "force_sync": True,
            }
            if size:
                extra_body["size"] = size

            def _format_view_prompt_block(v: dict[str, Any]) -> tuple[str, dict[str, Any]]:
                def _num(key: str, default: float = 0.0) -> float:
                    try:
                        return float(v.get(key, default))
                    except Exception:
                        return float(default)

                yaw = int(round(_num("yaw", 0.0)))
                pitch = int(round(_num("pitch", 0.0)))
                zoom = float(_num("zoom", 1.0))
                wide = bool(v.get("wideAngle", False))
                # Follow docs/model/多角度提示词.md (<sks> azimuth/elevation/distance) while keeping
                # numeric params explicit. To avoid conflicts, we emit ONE camera block and make the
                # numeric params authoritative.

                def _nearest_label(value: float, candidates: list[tuple[float, str]]) -> str:
                    best_label = candidates[0][1]
                    best_dist = float("inf")
                    for v0, label0 in candidates:
                        d = abs(value - v0)
                        if d < best_dist:
                            best_dist = d
                            best_label = label0
                    return best_label

                # Normalize yaw to [0, 360) for mapping.
                yaw360 = (yaw % 360 + 360) % 360
                azimuth_label = _nearest_label(
                    float(yaw360),
                    [
                        (0.0, "front view"),
                        (45.0, "front-right quarter view"),
                        (90.0, "right side view"),
                        (135.0, "back-right quarter view"),
                        (180.0, "back view"),
                        (225.0, "back-left quarter view"),
                        (270.0, "left side view"),
                        (315.0, "front-left quarter view"),
                    ],
                )
                elevation_label = _nearest_label(
                    float(pitch),
                    [
                        (-30.0, "low-angle shot"),
                        (0.0, "eye-level shot"),
                        (30.0, "elevated shot"),
                        (60.0, "high-angle shot"),
                    ],
                )
                # Treat zoom as "closer == bigger zoom".
                if zoom >= 1.35:
                    distance_label = "close-up"
                elif zoom <= 0.85:
                    distance_label = "wide shot"
                else:
                    distance_label = "medium shot"

                lens_label = "wide-angle lens" if wide else ""
                sks_line = " ".join(
                    [
                        "<sks>",
                        azimuth_label,
                        elevation_label,
                        distance_label,
                        lens_label,
                    ]
                ).strip()

                text = "\n".join(
                    [
                        "相机参数（严格执行；仅改变机位/视角；不要生成拼接图/多宫格）："
                        f"Yaw(水平旋转)={yaw}°；Pitch(俯仰)={pitch}°；Zoom(缩放)={zoom:.2f}x；广角镜头={'开' if wide else '关'}",
                        f"相机标签（辅助理解，由参数自动映射）：{sks_line}",
                    ]
                ).strip()
                return (
                    text,
                    {
                        "yaw": yaw,
                        "pitch": pitch,
                        "zoom": zoom,
                        "wideAngle": wide,
                        "sks": sks_line,
                        "azimuth_label": azimuth_label,
                        "elevation_label": elevation_label,
                        "distance_label": distance_label,
                    },
                )

            if views:
                effective_views = views[:6]
                response_data: list[dict[str, Any]] = []
                provider_responses: list[Any] = []
                per_view_prompts: list[str] = []
                per_view_meta: list[dict[str, Any]] = []

                for idx, view in enumerate(effective_views):
                    base_prompt = str(prompt or "").strip()
                    view_block, view_meta = _format_view_prompt_block(view)
                    # Avoid adding any additional camera description here; `view_block` is the only
                    # camera-parameter section so we don't introduce conflicts/ambiguity.
                    per_view_prompt = "\n".join([base_prompt, view_block]).strip()
                    per_view_prompts.append(per_view_prompt)
                    per_view_meta.append(view_meta)

                    one = images_generations(
                        model=str(model_id),
                        prompt=per_view_prompt,
                        n=1,
                        size=str(size or ""),
                        response_format="url",
                        extra_body=extra_body,
                        user_id=str(getattr(self, "user_id", "") or "") or None,
                    )
                    provider_responses.append((one or {}).get("provider_response"))
                    data_list = (one or {}).get("data") or []
                    if not isinstance(data_list, list) or not data_list:
                        return self._error(f"Gateway returned no images for view {idx + 1}: {one}")
                    first = data_list[0] if isinstance(data_list[0], dict) else {}
                    url = first.get("url") or first.get("image_url")
                    if not isinstance(url, str) or not url.strip():
                        return self._error(f"Gateway returned invalid image url for view {idx + 1}: {one}")
                    response_data.append({"url": str(url).strip()})

                # Replace count with number of views actually generated.
                image_count = len(response_data)
                # Keep only the last provider response for compatibility, but also embed all in payload below.
                response = {"data": response_data, "provider_response": provider_responses[-1] if provider_responses else None}
                provider_response_multi = provider_responses
            else:
                response = images_generations(
                    model=str(model_id),
                    prompt=prompt,
                    n=int(image_count),
                    size=str(size or ""),
                    response_format="url",
                    extra_body=extra_body,
                    user_id=str(getattr(self, "user_id", "") or "") or None,
                )
                provider_response_multi = None

                response_data = (response or {}).get("data") or []
                if not isinstance(response_data, list) or not response_data:
                    return self._error(f"Gateway returned no images: {response}")

            images: list[dict[str, Any]] = []
            preview_gallery: list[dict[str, Any]] = []
            for index, entry in enumerate(response_data):
                image_url = None
                if isinstance(entry, dict):
                    image_url = entry.get("url") or entry.get("image_url")
                if not isinstance(image_url, str) or not image_url.strip():
                    continue
                image_url = image_url.strip()

                preview_data, preview_error = self._download_preview(image_url)
                image_record: dict[str, Any] = {"index": index, "image_url": image_url}
                if size:
                    image_record["size"] = size
                if override_w and override_h:
                    image_record["width"] = int(override_w)
                    image_record["height"] = int(override_h)
                if preview_data:
                    image_record["image_data_url"] = preview_data
                if preview_error:
                    image_record["preview_error"] = preview_error
                images.append(image_record)
                preview_gallery.append(
                    {
                        "index": index,
                        "image_url": image_url,
                        "image_data_url": preview_data,
                        "size": size or "",
                        "ratio": aspect_ratio,
                        **({"width": int(override_w), "height": int(override_h)} if (override_w and override_h) else {}),
                    }
                )

            generated_at = datetime.now(timezone.utc).isoformat()
            preview_token = str((response or {}).get("id") or f"{self.name}-{uuid4().hex[:6]}")
            # Expose the *actual* prompt sent to the model for single-view tool runs so logs
            # can confirm camera params (yaw/pitch/zoom/wideAngle) are included.
            payload_prompt = per_view_prompts[0] if (views and len(per_view_prompts) == 1) else prompt
            doubao_preview = {
                "token": preview_token,
                "kind": "image",
                "available": bool(preview_gallery),
                "generated_at": generated_at,
                "payload": {
                    "images": preview_gallery,
                    "prompt": payload_prompt,
                    "model": {"name": "qwen-image-edit-max", "model_id": str(model_id)},
                    "resolution": resolution,
                    "aspect_ratio": aspect_ratio,
                    "count": image_count,
                    "reference_images": reference_meta,
                    "tool": "multi_angle_camera",
                    **({"multi_angle_views": views[:6]} if views else {}),
                    **({"prompts": per_view_prompts, "views": per_view_meta} if views else {}),
                },
            }

            self.status = f"✅ Qwen 图像编辑生成成功 ({model_id})"
            return Data(
                data={
                    "provider": "gateway",
                    "images": images,
                    "prompt": payload_prompt,
                    "model": {"name": "qwen-image-edit-max", "model_id": str(model_id)},
                    "resolution": resolution,
                    "aspect_ratio": aspect_ratio,
                    "count": image_count,
                    "size": size,
                    "reference_images": reference_meta,
                    "provider_response": (response or {}).get("provider_response"),
                    **({"provider_responses": provider_response_multi} if provider_response_multi else {}),
                    **({"prompts": per_view_prompts, "views": per_view_meta} if views else {}),
                    "doubao_preview": doubao_preview,
                },
                type="image",
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gateway qwen-image-edit failed: {exc}")

        creds = resolve_credentials(
            component_app_id=None,
            component_access_token=None,
            component_api_key=self.api_key,
            env_api_key_var="ARK_API_KEY",
        )

        def _normalize_api_key(value: str) -> str:
            v = (value or "").strip().strip("'").strip('"')
            if v.lower().startswith("bearer "):
                v = v.split(" ", 1)[1].strip()
            if not v.startswith("****"):
                v = "".join(v.split())
            return v

        api_key = _normalize_api_key(creds.api_key or "")
        ak = _normalize_api_key(getattr(self, "ak", "") or "")
        sk = _normalize_api_key(getattr(self, "sk", "") or "")

        if api_key.startswith("****"):
            return self._error(
                "检测到 Provider Credentials 中保存了被掩码的 api_key（形如 ****1234），"
                "这不是有效的 Ark key。请在 Provider Credentials 中重新粘贴完整 ARK_API_KEY 保存。"
            )

        if not api_key and not (ak and sk):
            return self._error("未检测到豆包 API Key 或 AK/SK，请在节点或环境变量中配置。")

        model_meta = self.MODEL_CATALOG.get(self.model_name)
        if not model_meta:
            return self._error("未匹配到可用模型，请重新选择。")

        try:
            resolution = self.resolution or "2K（推荐）"
            aspect_ratio = self.aspect_ratio or "1:1"
            image_count = int(self.image_count or 1)
            image_count = max(1, min(image_count, 6))
            size_info = self._resolve_size(model_meta, resolution, aspect_ratio)
            reference_payloads, reference_meta = self._prepare_reference_images()
        except ValueError as exc:
            return self._error(str(exc))

        client_kwargs: dict[str, Any] = {
            "base_url": (self.api_base or "https://ark.cn-beijing.volces.com/api/v3").strip(),
            "region": (self.region or "cn-beijing").strip(),
            "timeout": float(self.timeout_seconds or 600.0),
            "max_retries": int(self.max_retries or 2),
        }
        if ak and sk:
            client_kwargs["ak"] = ak
            client_kwargs["sk"] = sk
        else:
            client_kwargs["api_key"] = api_key

        if Ark is None:
            return self._error("未安装 Ark 依赖（volcenginesdkarkruntime），无法调用 Seedream 模型。")

        client = Ark(**client_kwargs)

        request_kwargs: dict[str, Any] = {
            "model": model_meta["model_id"],
            "prompt": prompt,
            "size": size_info["size_value"],
            "response_format": "url",
            "watermark": False,
        }

        extra_body: dict[str, Any] = {}
        try:
            supported = set(inspect.signature(client.images.generate).parameters)
        except (TypeError, ValueError):  # pragma: no cover
            supported = set()

        if image_count > 1:
            sequential_options: Any
            if SequentialImageGenerationOptions is not None:
                sequential_options = SequentialImageGenerationOptions(max_images=image_count)
            else:
                sequential_options = {"max_images": image_count}

            if "sequential_image_generation" in supported:
                request_kwargs["sequential_image_generation"] = "auto"
            else:
                extra_body["sequential_image_generation"] = "auto"

            if "sequential_image_generation_options" in supported:
                request_kwargs["sequential_image_generation_options"] = sequential_options
            else:
                extra_body["sequential_image_generation_options"] = sequential_options

        if reference_payloads:
            if "image" in supported and isinstance(reference_payloads, str):
                request_kwargs["image"] = reference_payloads
            else:
                extra_body["image"] = reference_payloads

        if extra_body:
            request_kwargs["extra_body"] = extra_body

        self.status = "🎨 即梦模型提交成功，等待生成..."

        try:
            response = client.images.generate(**request_kwargs)
        except Exception as exc:
            return self._error(f"图片生成失败：{exc}")

        response_data = getattr(response, "data", None) or []
        if not response_data:
            return self._error("即梦接口未返回图片数据，请检查提示词或模型配额。")

        images = []
        preview_gallery = []
        for index, entry in enumerate(response_data):
            image_url = getattr(entry, "url", None) or getattr(entry, "image_url", None)
            if not image_url:
                continue
            size_text = getattr(entry, "size", None) or size_info["size_value"]
            width, height = self._parse_size(size_text)
            preview_data, preview_error = self._download_preview(image_url)
            image_record: dict[str, Any] = {
                "index": index,
                "image_url": image_url,
                "size": size_text or f"{width}x{height}" if width and height else "",
                "width": width,
                "height": height,
            }
            if preview_data:
                image_record["image_data_url"] = preview_data
            if preview_error:
                image_record["preview_error"] = preview_error
            images.append(image_record)

            gallery_item = {
                "index": index,
                "image_url": image_url,
                "image_data_url": preview_data,
                "width": width,
                "height": height,
                "size": image_record["size"],
                "ratio": aspect_ratio,
            }
            preview_gallery.append(gallery_item)

        generated_at = datetime.now(timezone.utc).isoformat()
        preview_token = getattr(response, "id", None) or f"{self.name}-{uuid4().hex[:6]}"
        doubao_preview = {
            "token": preview_token,
            "kind": "image",
            "available": bool(preview_gallery),
            "generated_at": generated_at,
            "payload": {
                "images": preview_gallery,
                "prompt": prompt,
                "model": {
                    "name": self.model_name,
                    "model_id": model_meta["model_id"],
                },
                "size": size_info,
                "reference_images": reference_meta,
                "image_count": len(preview_gallery),
            },
        }

        self.status = f"✅ 已生成 {len(images)} 张图片（{size_info['label']}）"

        result_data = {
            "prompt": prompt,
            "model": self.model_name,
            "model_id": model_meta["model_id"],
            "size": size_info,
            "aspect_ratio": aspect_ratio,
            "generated_images": images,
            "reference_images": reference_meta,
            "doubao_preview": doubao_preview,
        }

        usage = getattr(response, "usage", None)
        if usage:
            result_data["usage"] = {
                "generated_images": getattr(usage, "generated_images", None),
                "output_tokens": getattr(usage, "output_tokens", None),
                "total_tokens": getattr(usage, "total_tokens", None),
            }

        return Data(data=result_data, type="image")

    def _build_images_doubao_gateway(
        self,
        *,
        prompt: str,
        model_meta: dict[str, Any],
        resolution: str,
        aspect_ratio: str,
        image_count: int,
        size_info: dict[str, Any],
        reference_payloads: list[str],
        reference_meta: list[dict[str, Any]],
    ) -> Data:
        """Doubao/Ark image generation via hosted gateway."""
        try:
            from langflow.gateway.client import images_generations

            extra_body: dict[str, Any] = {"watermark": False}
            if image_count > 1:
                extra_body["sequential_image_generation"] = "auto"
                extra_body["sequential_image_generation_options"] = {"max_images": int(image_count)}
            if reference_payloads:
                extra_body["image"] = reference_payloads

            self.status = "Submitting image generation task (gateway)..."
            response = images_generations(
                model=str(model_meta["model_id"]),
                prompt=prompt,
                n=int(image_count),
                size=str(size_info["size_value"]),
                response_format="url",
                extra_body=extra_body,
                user_id=str(getattr(self, "user_id", "") or "") or None,
            )

            response_data = (response or {}).get("data") or []
            if not isinstance(response_data, list) or not response_data:
                return self._error(f"Gateway returned no images: {response}")

            images: list[dict[str, Any]] = []
            preview_gallery: list[dict[str, Any]] = []
            for index, entry in enumerate(response_data):
                image_url = None
                if isinstance(entry, dict):
                    image_url = entry.get("url") or entry.get("image_url")
                if not isinstance(image_url, str) or not image_url.strip():
                    continue
                image_url = image_url.strip()

                size_text = str(size_info.get("size_value") or "")
                width, height = self._parse_size(size_text)
                preview_data, preview_error = self._download_preview(image_url)
                image_record: dict[str, Any] = {
                    "index": index,
                    "image_url": image_url,
                    "size": size_text or (f"{width}x{height}" if width and height else ""),
                    "width": width,
                    "height": height,
                }
                if preview_data:
                    image_record["image_data_url"] = preview_data
                if preview_error:
                    image_record["preview_error"] = preview_error
                images.append(image_record)

                preview_gallery.append(
                    {
                        "index": index,
                        "image_url": image_url,
                        "image_data_url": preview_data,
                        "width": width,
                        "height": height,
                        "size": image_record["size"],
                        "ratio": aspect_ratio,
                    }
                )

            generated_at = datetime.now(timezone.utc).isoformat()
            preview_token = str((response or {}).get("id") or f"{self.name}-{uuid4().hex[:6]}")
            doubao_preview = {
                "token": preview_token,
                "kind": "image",
                "available": bool(preview_gallery),
                "generated_at": generated_at,
                "payload": {
                    "images": preview_gallery,
                    "prompt": prompt,
                    "model": {"name": self.model_name, "model_id": model_meta["model_id"]},
                    "resolution": resolution,
                    "aspect_ratio": aspect_ratio,
                    "count": image_count,
                    "reference_images": reference_meta,
                },
            }

            self.status = "Image generated"
            return Data(
                data={
                    "provider": "gateway",
                    "images": images,
                    "prompt": prompt,
                    "model": {"name": self.model_name, "model_id": model_meta["model_id"]},
                    "resolution": resolution,
                    "aspect_ratio": aspect_ratio,
                    "count": image_count,
                    "size": size_info.get("size_value"),
                    "reference_images": reference_meta,
                    "provider_response": (response or {}).get("provider_response"),
                    "doubao_preview": doubao_preview,
                },
                type="image",
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gateway image generation failed: {exc}")

    @staticmethod
    def _parse_int_list(value: Any) -> list[int]:
        if value is None:
            return []
        if isinstance(value, (list, tuple)):
            items = list(value)
        else:
            items = [value]

        out: list[int] = []
        for item in items:
            if item is None:
                continue
            if isinstance(item, int):
                out.append(item)
                continue
            s = str(item).strip()
            if not s:
                continue
            for part in s.replace("，", ",").replace(" ", ",").split(","):
                part = part.strip()
                if not part:
                    continue
                try:
                    out.append(int(part))
                except ValueError:
                    continue
        return out

    @staticmethod
    def _map_kling_resolution(value: str) -> str:
        v = str(value or "").strip().lower()
        if not v:
            return "1k"
        # Accept both UI labels and raw upstream enum.
        if "1k" in v:
            return "1k"
        if "2k" in v:
            return "2k"
        return "1k"

    @staticmethod
    def _map_kling_aspect_ratio(value: str) -> str:
        v = str(value or "").strip()
        if not v:
            return "auto"
        # UI uses "adaptive" which maps to upstream "auto".
        if v == "adaptive":
            return "auto"
        allowed = {"16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9", "auto"}
        return v if v in allowed else "auto"

    @staticmethod
    def _strip_data_url_to_base64(value: str) -> str:
        """Kling image_list expects base64 string or an accessible URL; strip data-url prefix when present."""
        v = str(value or "").strip()
        if not v:
            return ""
        if v.startswith("data:") and "base64," in v:
            return v.split("base64,", 1)[1].strip()
        return v

    def _build_images_kling_gateway(
        self,
        *,
        prompt: str,
        model_meta: dict[str, Any],
        resolution: str,
        aspect_ratio: str,
        image_count: int,
        reference_payloads: list[str],
        reference_meta: list[dict[str, Any]],
    ) -> Data:
        """Kling (kling-image-o1) image generation via hosted gateway."""
        try:
            from langflow.gateway.client import images_generations

            kling_resolution = self._map_kling_resolution(resolution)
            kling_ratio = self._map_kling_aspect_ratio(aspect_ratio)

            image_list: list[dict[str, Any]] = []
            for payload in reference_payloads:
                normalized = self._strip_data_url_to_base64(payload)
                if normalized:
                    image_list.append({"image": normalized})

            element_ids = self._parse_int_list(getattr(self, "kling_element_ids", None))
            element_list = [{"element_id": eid} for eid in element_ids]

            if len(image_list) + len(element_list) > 10:
                return self._error("kling O1：参考图（image_list）与主体（element_list）数量之和不得超过 10。")

            callback_url = str(getattr(self, "kling_callback_url", "") or "").strip()
            external_task_id = str(getattr(self, "kling_external_task_id", "") or "").strip()

            kling_payload: dict[str, Any] = {
                "model_name": str(model_meta.get("model_id") or "kling-image-o1"),
                "prompt": prompt,
                "resolution": kling_resolution,
                "n": int(image_count),
                "aspect_ratio": kling_ratio,
            }
            if image_list:
                kling_payload["image_list"] = image_list
            if element_list:
                kling_payload["element_list"] = element_list
            if callback_url:
                kling_payload["callback_url"] = callback_url
            if external_task_id:
                kling_payload["external_task_id"] = external_task_id

            response = images_generations(
                model=str(model_meta.get("model_id") or "kling-image-o1"),
                prompt=prompt,
                n=int(image_count),
                size="1024x1024",
                response_format="url",
                extra_body={"kling_payload": kling_payload},
                user_id=str(getattr(self, "user_id", "") or "") or None,
            )

            response_data = (response or {}).get("data") or []
            if not isinstance(response_data, list) or not response_data:
                return self._error(f"Gateway returned no images: {response}")

            images: list[dict[str, Any]] = []
            preview_gallery: list[dict[str, Any]] = []
            for index, entry in enumerate(response_data):
                image_url = None
                if isinstance(entry, dict):
                    image_url = entry.get("url") or entry.get("image_url")
                if not isinstance(image_url, str) or not image_url.strip():
                    continue
                image_url = image_url.strip()

                preview_data, preview_error = self._download_preview(image_url)
                image_record: dict[str, Any] = {
                    "index": index,
                    "image_url": image_url,
                    "resolution": kling_resolution,
                    "aspect_ratio": kling_ratio,
                }
                if preview_data:
                    image_record["image_data_url"] = preview_data
                if preview_error:
                    image_record["preview_error"] = preview_error
                images.append(image_record)

                preview_gallery.append(
                    {
                        "index": index,
                        "image_url": image_url,
                        "image_data_url": preview_data,
                        "ratio": kling_ratio,
                    }
                )

            generated_at = datetime.now(timezone.utc).isoformat()
            preview_token = str((response or {}).get("id") or f"{self.name}-{uuid4().hex[:6]}")
            doubao_preview = {
                "token": preview_token,
                "kind": "image",
                "available": bool(preview_gallery),
                "generated_at": generated_at,
                "payload": {
                    "images": preview_gallery,
                    "prompt": prompt,
                    "model": {"name": self.model_name, "model_id": str(model_meta.get("model_id") or "kling-image-o1")},
                    "resolution": kling_resolution,
                    "aspect_ratio": kling_ratio,
                    "count": image_count,
                    "reference_images": reference_meta,
                    "element_list": element_list,
                },
            }

            return Data(
                data={
                    "provider": "gateway",
                    "images": images,
                    "prompt": prompt,
                    "model": {"name": self.model_name, "model_id": str(model_meta.get("model_id") or "kling-image-o1")},
                    "resolution": kling_resolution,
                    "aspect_ratio": kling_ratio,
                    "count": image_count,
                    "reference_images": reference_meta,
                    "provider_response": (response or {}).get("provider_response"),
                    "doubao_preview": doubao_preview,
                },
                type="image",
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gateway kling image failed: {exc}")

    def _build_images_wan_gateway(
        self,
        *,
        prompt: str,
        model_meta: dict[str, Any],
        resolution: str,
        aspect_ratio: str,
        image_count: int,
        size_info: dict[str, Any],
        reference_payloads: list[str],
        reference_meta: list[dict[str, Any]],
    ) -> Data:
        """Wan (DashScope) image generation via hosted gateway."""
        try:
            from langflow.gateway.client import images_generations

            is_i2i = bool(reference_payloads)
            dashscope_model = model_meta.get("i2i_model") if is_i2i else model_meta.get("t2i_model")
            if not dashscope_model:
                return self._error("Missing dashscope model mapping.")

            extra_body: dict[str, Any] = {
                "images": reference_payloads,
                "negative_prompt": str(getattr(self, "negative_prompt", "") or ""),
                "seed": int(getattr(self, "seed", 0) or 0),
                "prompt_extend": bool(getattr(self, "prompt_extend", True)),
                "watermark": bool(getattr(self, "watermark", False)),
                "size": str(size_info.get("size_value") or ""),
            }

            response = images_generations(
                model=str(dashscope_model),
                prompt=prompt,
                n=int(image_count),
                size=str(size_info.get("size_value") or ""),
                response_format="url",
                extra_body=extra_body,
                user_id=str(getattr(self, "user_id", "") or "") or None,
            )

            response_data = (response or {}).get("data") or []
            if not isinstance(response_data, list) or not response_data:
                return self._error(f"Gateway returned no images: {response}")

            images: list[dict[str, Any]] = []
            preview_gallery: list[dict[str, Any]] = []
            for index, entry in enumerate(response_data):
                image_url = None
                if isinstance(entry, dict):
                    image_url = entry.get("url") or entry.get("image_url")
                if not isinstance(image_url, str) or not image_url.strip():
                    continue
                image_url = image_url.strip()

                size_text = str(size_info.get("size_value") or "")
                width, height = self._parse_size(size_text.replace("*", "x"))
                preview_data, preview_error = self._download_preview(image_url)
                image_record: dict[str, Any] = {"index": index, "image_url": image_url, "width": width, "height": height, "size": size_text}
                if preview_data:
                    image_record["image_data_url"] = preview_data
                if preview_error:
                    image_record["preview_error"] = preview_error
                images.append(image_record)
                preview_gallery.append(
                    {
                        "index": index,
                        "image_url": image_url,
                        "image_data_url": preview_data,
                        "width": width,
                        "height": height,
                        "size": size_text,
                        "ratio": aspect_ratio,
                    }
                )

            generated_at = datetime.now(timezone.utc).isoformat()
            preview_token = str((response or {}).get("id") or f"{self.name}-{uuid4().hex[:6]}")
            doubao_preview = {
                "token": preview_token,
                "kind": "image",
                "available": bool(preview_gallery),
                "generated_at": generated_at,
                "payload": {
                    "images": preview_gallery,
                    "prompt": prompt,
                    "model": {"name": self.model_name, "model_id": str(dashscope_model)},
                    "resolution": resolution,
                    "aspect_ratio": aspect_ratio,
                    "count": image_count,
                    "reference_images": reference_meta,
                },
            }

            return Data(
                data={
                    "provider": "gateway",
                    "images": images,
                    "prompt": prompt,
                    "model": {"name": self.model_name, "model_id": str(dashscope_model)},
                    "resolution": resolution,
                    "aspect_ratio": aspect_ratio,
                    "count": image_count,
                    "size": size_info.get("size_value"),
                    "reference_images": reference_meta,
                    "provider_response": (response or {}).get("provider_response"),
                    "doubao_preview": doubao_preview,
                },
                type="image",
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gateway wan image failed: {exc}")

    def _build_images_gemini_gateway(
        self,
        *,
        prompt: str,
        model_meta: dict[str, Any],
        resolution: str,
        aspect_ratio: str,
        image_count: int,
        size_info: dict[str, Any],
        reference_payloads: list[str],
        reference_meta: list[dict[str, Any]],
    ) -> Data:
        """Gemini image generation via hosted gateway (Nano Banana models)."""
        try:
            from langflow.gateway.client import images_generations
            max_reference_images = int(model_meta.get("max_reference_images") or 0) or self.MAX_REFERENCE_IMAGES

            def _env_truthy(name: str) -> bool:
                value = str(os.getenv(name, "")).strip().lower()
                return value in {"1", "true", "yes", "y", "on"}

            supports_multi_turn = bool(model_meta.get("supports_multi_turn"))
            enable_multi_turn = supports_multi_turn and (
                bool(getattr(self, "enable_multi_turn", False)) or _env_truthy(self.GEMINI_ENV_ENABLE_MULTI_TURN)
            )
            supports_google_search = bool(model_meta.get("supports_google_search"))
            enable_google_search = supports_google_search and (
                bool(getattr(self, "enable_google_search", False)) or _env_truthy(self.GEMINI_ENV_ENABLE_GOOGLE_SEARCH)
            )
            try:
                max_turns = int(str(os.getenv(self.GEMINI_ENV_MAX_TURNS, "4")).strip() or "4")
            except Exception:
                max_turns = 4
            max_turns = max(1, min(max_turns, 12))

            draft_payload = getattr(self, "draft_output", None)
            if isinstance(draft_payload, Data):
                draft_payload = draft_payload.data

            def _extract_gemini_history(value: Any) -> list[dict[str, Any]]:
                if not value or not isinstance(value, dict):
                    return []
                direct = value.get("gemini_history")
                if isinstance(direct, list) and all(isinstance(item, dict) for item in direct):
                    return direct  # type: ignore[return-value]
                preview = value.get("doubao_preview")
                if isinstance(preview, dict):
                    payload = preview.get("payload")
                    if isinstance(payload, dict):
                        history = payload.get("gemini_history")
                        if isinstance(history, list) and all(isinstance(item, dict) for item in history):
                            return history  # type: ignore[return-value]
                return []

            def _extract_prompt(value: Any) -> str:
                if not value or not isinstance(value, dict):
                    return ""
                direct = value.get("prompt")
                if isinstance(direct, str) and direct.strip():
                    return direct.strip()
                preview = value.get("doubao_preview")
                if isinstance(preview, dict):
                    payload = preview.get("payload")
                    if isinstance(payload, dict):
                        prompt_value = payload.get("prompt")
                        if isinstance(prompt_value, str) and prompt_value.strip():
                            return prompt_value.strip()
                return ""

            def _extract_cached_gallery(value: Any) -> list[dict[str, Any]]:
                if not value or not isinstance(value, dict):
                    return []

                preview = value.get("doubao_preview")
                if isinstance(preview, dict):
                    preview_payload = preview.get("payload")
                    if isinstance(preview_payload, dict):
                        images = preview_payload.get("images")
                        if isinstance(images, list) and all(isinstance(item, dict) for item in images):
                            return [item for item in images if item.get("image_data_url") or item.get("image_url") or item.get("url")]

                direct_images = value.get("images")
                if isinstance(direct_images, list) and all(isinstance(item, dict) for item in direct_images):
                    return [item for item in direct_images if item.get("image_data_url") or item.get("image_url") or item.get("url")]

                generated_images = value.get("generated_images")
                if isinstance(generated_images, list) and all(isinstance(item, dict) for item in generated_images):
                    gallery: list[dict[str, Any]] = []
                    for item in generated_images:
                        inline = item.get("image_data_url") or item.get("preview_data_url") or item.get("preview_base64")
                        remote = item.get("image_url") or item.get("url")
                        if inline or remote:
                            gallery.append(
                                {
                                    "index": item.get("index", len(gallery)),
                                    "image_data_url": inline,
                                    "image_url": remote,
                                    "label": item.get("label"),
                                }
                            )
                    return gallery

                return []

            def _inline_part_from_data_url(data_url: str) -> dict[str, Any] | None:
                if not isinstance(data_url, str) or not data_url.strip():
                    return None
                try:
                    return self._gemini_inline_part_from_data_url(data_url)
                except Exception:
                    return None

            history: list[dict[str, Any]] = _extract_gemini_history(draft_payload) if enable_multi_turn else []
            if enable_multi_turn and not history:
                draft_prompt = _extract_prompt(draft_payload)
                draft_gallery = _extract_cached_gallery(draft_payload)
                draft_payloads: list[str] = []
                if draft_gallery:
                    try:
                        draft_payloads, _ = self._prepare_reference_images_from_items(
                            draft_gallery,
                            limit=max_reference_images,
                        )
                    except Exception:
                        draft_payloads = []
                if draft_prompt and draft_payloads:
                    user_parts = [{"text": draft_prompt}]
                    model_parts = []
                    for data_url in draft_payloads:
                        inline = _inline_part_from_data_url(data_url)
                        if inline:
                            model_parts.append(inline)
                    if model_parts:
                        history = [{"role": "user", "parts": user_parts}, {"role": "model", "parts": model_parts}]

            if history:
                max_messages = max_turns * 2
                if len(history) > max_messages:
                    history = history[-max_messages:]

            parts: list[dict[str, Any]] = [{"text": prompt}]
            for data_url in reference_payloads:
                inline = _inline_part_from_data_url(data_url)
                if inline:
                    parts.append(inline)

            user_content = {"role": "user", "parts": parts}
            contents = [*history, user_content] if history else [user_content]

            gemini_payload: dict[str, Any] = {
                "contents": contents,
                "generationConfig": {
                    "imageConfig": {"aspectRatio": aspect_ratio},
                    "responseModalities": ["TEXT", "IMAGE"] if enable_google_search else ["IMAGE"],
                },
            }
            if enable_google_search:
                gemini_payload["tools"] = [{"google_search": {}}]

            response = images_generations(
                model=str(model_meta["model_id"]),
                prompt=prompt,
                n=int(image_count),
                size=str(size_info.get("size_value") or ""),
                response_format="b64_json",
                extra_body={"gemini_payload": gemini_payload},
                user_id=str(getattr(self, "user_id", "") or "") or None,
            )

            response_data = (response or {}).get("data") or []
            if not isinstance(response_data, list) or not response_data:
                return self._error(f"Gateway returned no images: {response}")

            images: list[dict[str, Any]] = []
            preview_gallery: list[dict[str, Any]] = []
            for index, entry in enumerate(response_data):
                image_data_url = None
                image_url = None
                if isinstance(entry, dict):
                    if isinstance(entry.get("b64_json"), str) and entry["b64_json"].strip():
                        image_data_url = f"data:image/png;base64,{entry['b64_json'].strip()}"
                    elif isinstance(entry.get("url"), str):
                        image_url = entry["url"].strip()
                record: dict[str, Any] = {"index": index}
                if image_url:
                    record["image_url"] = image_url
                    preview_data, preview_error = self._download_preview(image_url)
                    if preview_data:
                        record["image_data_url"] = preview_data
                    if preview_error:
                        record["preview_error"] = preview_error
                if image_data_url:
                    record["image_data_url"] = image_data_url
                images.append(record)
                preview_gallery.append({"index": index, "image_url": image_url, "image_data_url": record.get("image_data_url"), "ratio": aspect_ratio})

            generated_at = datetime.now(timezone.utc).isoformat()
            preview_token = str((response or {}).get("id") or f"{self.name}-{uuid4().hex[:6]}")
            doubao_preview = {
                "token": preview_token,
                "kind": "image",
                "available": bool(preview_gallery),
                "generated_at": generated_at,
                "payload": {
                    "images": preview_gallery,
                    "prompt": prompt,
                    "model": {"name": self.model_name, "model_id": model_meta["model_id"]},
                    "resolution": resolution,
                    "aspect_ratio": aspect_ratio,
                    "count": image_count,
                    "reference_images": reference_meta,
                    "gemini_history": None,
                },
            }

            next_history: list[dict[str, Any]] = history[:] if history else []
            if enable_multi_turn:
                model_parts: list[dict[str, Any]] = []
                for entry in preview_gallery:
                    inline = None
                    if isinstance(entry, dict):
                        data_url = entry.get("image_data_url")
                        if isinstance(data_url, str) and data_url.strip():
                            inline = _inline_part_from_data_url(data_url)
                        if not inline:
                            url_value = entry.get("image_url") or entry.get("url")
                            if isinstance(url_value, str) and url_value.strip():
                                inline_data, _ = self._download_reference_from_url(url_value)
                                if inline_data:
                                    inline = _inline_part_from_data_url(inline_data)
                    if inline:
                        model_parts.append(inline)
                if model_parts:
                    next_history.extend([user_content, {"role": "model", "parts": model_parts}])
                    max_messages = max_turns * 2
                    if len(next_history) > max_messages:
                        next_history = next_history[-max_messages:]
                doubao_preview["payload"]["gemini_history"] = next_history

            return Data(
                data={
                    "provider": "gateway",
                    "images": images,
                    "prompt": prompt,
                    "model": {"name": self.model_name, "model_id": model_meta["model_id"]},
                    "resolution": resolution,
                    "aspect_ratio": aspect_ratio,
                    "count": image_count,
                    "reference_images": reference_meta,
                    "provider_response": (response or {}).get("provider_response"),
                    "gemini_history": next_history if enable_multi_turn else None,
                    "doubao_preview": doubao_preview,
                },
                type="image",
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gateway gemini image failed: {exc}")

    def _build_images_gemini(self, *, prompt: str, model_meta: dict[str, Any]) -> Data:
        model_id = str(model_meta.get("model_id") or "").strip()
        if not model_id:
            return self._error("Gemini model_id 缺失，请检查配置。")

        max_reference_images = int(model_meta.get("max_reference_images") or 0) or self.MAX_REFERENCE_IMAGES
        supports_image_size = bool(model_meta.get("supports_image_size"))
        high_fidelity_limit = int(model_meta.get("max_high_fidelity_reference_images") or 0) or None

        aspect_ratio = str(self.aspect_ratio or "1:1").strip() or "1:1"
        if aspect_ratio not in self.ASPECT_RATIOS:
            return self._error("请选择有效的图像比例。")
        resolution = str(self.resolution or "").strip()

        # 解析 Gemini API Key（优先级：gemini provider → google provider → 环境变量 GEMINI_API_KEY → GOOGLE_API_KEY → 节点参数）
        api_key = self._resolve_gemini_api_key()
        if not api_key:
            return self._error("未检测到 GEMINI_API_KEY/GOOGLE_API_KEY，请在 .env 或 Provider Credentials (Gemini/Google) 中配置。")

        warnings: list[str] = []

        draft_payload = getattr(self, "draft_output", None)
        if isinstance(draft_payload, Data):
            draft_payload = draft_payload.data

        def _env_truthy(name: str) -> bool:
            value = str(os.getenv(name, "")).strip().lower()
            return value in {"1", "true", "yes", "y", "on"}

        supports_multi_turn = bool(model_meta.get("supports_multi_turn"))
        supports_google_search = bool(model_meta.get("supports_google_search"))
        enable_multi_turn = supports_multi_turn and (
            bool(getattr(self, "enable_multi_turn", False)) or _env_truthy(self.GEMINI_ENV_ENABLE_MULTI_TURN)
        )
        enable_google_search = supports_google_search and (
            bool(getattr(self, "enable_google_search", False)) or _env_truthy(self.GEMINI_ENV_ENABLE_GOOGLE_SEARCH)
        )
        try:
            max_turns = int(str(os.getenv(self.GEMINI_ENV_MAX_TURNS, "4")).strip() or "4")
        except Exception:
            max_turns = 4
        max_turns = max(1, min(max_turns, 12))

        def _extract_gemini_history(value: Any) -> list[dict[str, Any]]:
            if not value or not isinstance(value, dict):
                return []
            direct = value.get("gemini_history")
            if isinstance(direct, list) and all(isinstance(item, dict) for item in direct):
                return direct  # type: ignore[return-value]
            preview = value.get("doubao_preview")
            if isinstance(preview, dict):
                payload = preview.get("payload")
                if isinstance(payload, dict):
                    history = payload.get("gemini_history")
                    if isinstance(history, list) and all(isinstance(item, dict) for item in history):
                        return history  # type: ignore[return-value]
            return []

        history: list[dict[str, Any]] = _extract_gemini_history(draft_payload) if enable_multi_turn else []

        # Multi-turn mode prefers using full conversation history; otherwise we fallback to
        # taking the last preview output (persisted by the frontend) as extra input images.
        draft_images, draft_meta = ([], [])
        if not history:
            draft_images, draft_meta = self._prepare_reference_images_from_value(
                draft_payload,
                max_reference_images=max_reference_images,
            )
        uploaded_images, uploaded_meta = self._prepare_reference_images(
            max_reference_images=max_reference_images,
        )

        input_images: list[str] = []
        input_meta: list[dict[str, Any]] = []
        for idx, data_url in enumerate(draft_images):
            if len(input_images) >= max_reference_images:
                break
            meta = draft_meta[idx] if idx < len(draft_meta) else {}
            input_images.append(data_url)
            input_meta.append({**meta, "origin": "draft_output"})

        for idx, data_url in enumerate(uploaded_images):
            if len(input_images) >= max_reference_images:
                warnings.append(f"参考图输入超过上限，已自动忽略后续图片（上限 {max_reference_images} 张）。")
                break
            meta = uploaded_meta[idx] if idx < len(uploaded_meta) else {}
            input_images.append(data_url)
            input_meta.append({**meta, "origin": "reference_images"})

        if not prompt:
            def _extract_cached_gallery(value: Any) -> list[dict[str, Any]]:
                if not value or not isinstance(value, dict):
                    return []

                preview = value.get("doubao_preview")
                if isinstance(preview, dict):
                    preview_payload = preview.get("payload")
                    if isinstance(preview_payload, dict):
                        images = preview_payload.get("images")
                        if isinstance(images, list) and all(isinstance(item, dict) for item in images):
                            return [item for item in images if item.get("image_data_url") or item.get("image_url") or item.get("url")]

                direct_images = value.get("images")
                if isinstance(direct_images, list) and all(isinstance(item, dict) for item in direct_images):
                    return [item for item in direct_images if item.get("image_data_url") or item.get("image_url") or item.get("url")]

                generated_images = value.get("generated_images")
                if isinstance(generated_images, list) and all(isinstance(item, dict) for item in generated_images):
                    gallery: list[dict[str, Any]] = []
                    for item in generated_images:
                        inline = item.get("image_data_url") or item.get("preview_data_url") or item.get("preview_base64")
                        remote = item.get("image_url") or item.get("url")
                        if inline or remote:
                            gallery.append(
                                {
                                    "index": item.get("index", len(gallery)),
                                    "image_data_url": inline,
                                    "image_url": remote,
                                    "label": item.get("label"),
                                }
                            )
                    return gallery

                return []

            generated_at = datetime.now(timezone.utc).isoformat()
            preview_gallery = [
                {"index": index, "image_data_url": data_url, "ratio": aspect_ratio}
                for index, data_url in enumerate(input_images)
            ]
            if not preview_gallery:
                cached = _extract_cached_gallery(draft_payload)
                if cached:
                    preview_gallery = cached
            base_payload = {
                "bridge_mode": True,
                "text": "",
                "images": preview_gallery,
                "model": {"name": self.model_name, "model_id": model_id},
                "warnings": warnings or None,
            }
            doubao_preview = {
                "token": f"{self.name}-bridge",
                "kind": "image",
                "available": bool(preview_gallery),
                "generated_at": generated_at,
                "payload": base_payload,
            }
            result_payload = {**base_payload, "doubao_preview": doubao_preview}
            self.status = "🔁 桥梁模式：提示词为空，直通预览输出"
            return Data(data=result_payload, type="image")

        if high_fidelity_limit and len(input_images) > high_fidelity_limit:
            warnings.append(f"Nano Banana Pro 建议高保真输入不超过 {high_fidelity_limit} 张，超过后可能影响细节质量。")

        try:
            parts: list[dict[str, Any]] = [{"text": prompt}]
            for data_url in input_images:
                inline = self._gemini_inline_part_from_data_url(data_url)
                if inline:
                    parts.append(inline)
        except ValueError as exc:
            return self._error(str(exc))

        generation_config: dict[str, Any] = {}
        # 添加 imageConfig（根据官方文档）
        if supports_image_size:
            image_size = self._gemini_image_size_from_resolution(resolution)
            if image_size:
                generation_config["imageConfig"] = {
                    "aspectRatio": aspect_ratio,
                    "imageSize": image_size,
                }
            else:
                generation_config["imageConfig"] = {
                    "aspectRatio": aspect_ratio,
                }
        else:
            # Nano Banana 不支持 imageSize，只设置 aspectRatio
            generation_config["imageConfig"] = {
                "aspectRatio": aspect_ratio,
            }
        # 默认只返回图片以减少 payload 体积；启用 tools/search 时通常需要文本输出。
        generation_config["responseModalities"] = ["TEXT", "IMAGE"] if enable_google_search else ["IMAGE"]

        user_content: dict[str, Any] = {"role": "user", "parts": parts}
        contents: list[dict[str, Any]] = [*history, user_content] if history else [user_content]

        payload: dict[str, Any] = {"contents": contents, "generationConfig": generation_config}

        if enable_google_search:
            payload["tools"] = [{"google_search": {}}]

        # 使用国内代理方式：通过 URL 参数传递 key
        url = f"{self.GEMINI_API_BASE}/models/{model_id}:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}

        # 调试日志（可选）
        import json
        from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

        self.status = f"🍌 调用 Gemini API (国内代理): {model_id}"
        # Never log raw API keys.
        try:
            split = urlsplit(url)
            query = [
                (key, "***" if key == "key" else value)
                for key, value in parse_qsl(split.query, keep_blank_values=True)
            ]
            safe_url = urlunsplit((split.scheme, split.netloc, split.path, urlencode(query), split.fragment))
        except Exception:
            safe_url = f"{self.GEMINI_API_BASE}/models/{model_id}:generateContent?key=***"
        print(f"[Gemini Debug] URL: {safe_url}")
        print(f"[Gemini Debug] Payload: {json.dumps(payload, indent=2, ensure_ascii=False)[:1000]}...")

        self.status = "🍌 Gemini 模型提交成功，等待生成..."
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=180)
            response.raise_for_status()
            result = response.json()

            # 调试：打印完整响应结构（不包含 data）
            print(f"[Gemini Debug] Response received, status={response.status_code}")
            if 'candidates' in result and result['candidates']:
                candidate = result['candidates'][0]
                print(f"  candidate keys: {list(candidate.keys())}")
                if 'content' in candidate and 'parts' in candidate['content']:
                    parts = candidate['content']['parts']
                    print(f"  parts count: {len(parts)}")
                    for i, part in enumerate(parts):
                        part_keys = list(part.keys())
                        print(f"    part {i}: {part_keys}")
                        if 'inlineData' in part:
                            inline = part['inlineData']
                            mime_type = inline.get('mimeType', 'unknown')
                            data_len = len(inline.get('data', ''))
                            print(f"      inlineData: mimeType={mime_type}, data_len={data_len}")
        except requests.HTTPError as exc:
            # 尝试获取详细的错误信息
            error_detail = str(exc)
            status_code = exc.response.status_code if exc.response else "Unknown"
            try:
                if exc.response is not None:
                    response_text = exc.response.text
                    error_json = exc.response.json()
                    if "error" in error_json:
                        error_info = error_json["error"]
                        error_detail = f"{error_info.get('status', '')}: {error_info.get('message', '')}"
                        # 添加更详细的错误信息
                        if "details" in error_info:
                            error_detail += f" | 详情: {error_info['details']}"
                    else:
                        error_detail = f"{response_text[:300]}"
            except Exception:
                if hasattr(exc, 'response') and exc.response:
                    error_detail = f"{error_detail} | 响应: {exc.response.text[:300]}"
            return self._error(f"Gemini API 调用失败 (HTTP {status_code}): {error_detail}")
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gemini 调用失败：{exc}")

        images, text = self._extract_gemini_images_and_text(result)
        if not images:
            # 添加调试：打印原始响应结构
            print(f"[Gemini Debug] No images found. Response structure:")
            print(f"  candidates: {list(result.get('candidates', []).__class__.__name__)}")
            if result.get('candidates'):
                first_candidate = result['candidates'][0] if isinstance(result['candidates'], list) else result['candidates']
                print(f"  first_candidate keys: {list(first_candidate.keys()) if isinstance(first_candidate, dict) else 'not a dict'}")
                if isinstance(first_candidate, dict) and 'content' in first_candidate:
                    content = first_candidate['content']
                    print(f"  content keys: {list(content.keys()) if isinstance(content, dict) else 'not a dict'}")
                    if isinstance(content, dict) and 'parts' in content:
                        parts = content['parts']
                        print(f"  parts count: {len(parts) if isinstance(parts, list) else 'not a list'}")
                        if isinstance(parts, list):
                            for i, part in enumerate(parts[:3]):  # 只打印前3个
                                print(f"    part {i} keys: {list(part.keys()) if isinstance(part, dict) else 'not a dict'}")
            return self._error("Gemini 未返回可用的图片数据，请检查提示词或稍后重试。")

        # 调试：打印图片信息
        print(f"[Gemini Debug] Found {len(images)} image(s)")
        for i, img in enumerate(images):
            print(f"  Image {i}: data URL prefix = {img[:100]}..., length = {len(img)}")

        # 处理图片：使用 PIL 重新编码去除 C2PA 签名
        processed_images = []
        for i, img_data_url in enumerate(images):
            try:
                print(f"[Gemini Debug] Processing image {i}, original length = {len(img_data_url)}")
                processed_url = self._process_gemini_image(img_data_url)
                if processed_url:
                    processed_images.append(processed_url)
                    reduction = (1 - len(processed_url)/len(img_data_url)) * 100
                    print(f"[Gemini Debug] Image {i} processed successfully: {len(img_data_url)} -> {len(processed_url)} bytes ({reduction:.1f}% reduction)")
                else:
                    # 如果处理失败，使用原始图片
                    processed_images.append(img_data_url)
                    print(f"[Gemini Debug] Image {i} processing returned None, using original")
            except Exception as e:
                # 处理出错，使用原始图片
                processed_images.append(img_data_url)
                print(f"[Gemini Debug] Image {i} processing error: {e}, using original")

        # 调试：打印最终图片 URL 长度
        print(f"[Gemini Debug] Final image data URL length: {len(processed_images[0]) if processed_images else 0}")

        generated_images: list[dict[str, Any]] = []
        preview_gallery: list[dict[str, Any]] = []
        for index, data_url in enumerate(processed_images):
            generated_images.append({"index": index, "image_data_url": data_url})

            # 获取图片尺寸信息
            width, height = self._get_image_dimensions_from_data_url(data_url)
            size_bytes = len(data_url) - len("data:image/jpeg;base64,")

            # 添加图片信息（注意：Gemini 没有 HTTP URL，所以 image_url 设为 None）
            # 前端应该优先使用 image_data_url 来显示图片
            preview_gallery.append({
                "index": index,
                "image_url": None,  # Gemini 没有 HTTP URL，设为 None 让前端使用 image_data_url
                "image_data_url": data_url,
                "width": width,
                "height": height,
                "size": f"{size_bytes / 1024:.1f}KB" if size_bytes > 0 else None,
                "ratio": aspect_ratio
            })

        generated_at = datetime.now(timezone.utc).isoformat()
        preview_token = f"gemini-{uuid4().hex[:8]}"
        resolved_image_size = (
            self._gemini_image_size_from_resolution(resolution) if supports_image_size else None
        )

        next_history: list[dict[str, Any]] = history[:] if history else []
        if enable_multi_turn:
            model_parts: list[dict[str, Any]] = []
            if isinstance(text, str) and text.strip():
                model_parts.append({"text": text.strip()})
            for data_url in processed_images:
                try:
                    inline = self._gemini_inline_part_from_data_url(data_url)
                except Exception:
                    inline = None
                if inline:
                    model_parts.append(inline)
            if model_parts:
                next_history.extend([user_content, {"role": "model", "parts": model_parts}])
                max_messages = max_turns * 2
                if len(next_history) > max_messages:
                    next_history = next_history[-max_messages:]

        doubao_preview = {
            "token": preview_token,
            "kind": "image",
            "available": True,
            "generated_at": generated_at,
            "payload": {
                "images": preview_gallery,
                "prompt": prompt,
                "text": text,
                "model": {"name": self.model_name, "model_id": model_id},
                "aspect_ratio": aspect_ratio,
                "image_size": resolved_image_size,
                "input_images": input_meta,
                "image_count": len(preview_gallery),
                "warnings": warnings or None,
                "gemini_history": next_history if enable_multi_turn else None,
            },
        }

        result_data: dict[str, Any] = {
            "prompt": prompt,
            "text": text,
            "model": self.model_name,
            "model_id": model_id,
            "aspect_ratio": aspect_ratio,
            "image_size": resolved_image_size,
            "generated_images": generated_images,
            "input_images": input_meta,
            "warnings": warnings or None,
            "gemini_history": next_history if enable_multi_turn else None,
            "doubao_preview": doubao_preview,
        }
        if isinstance(result, dict) and result.get("usageMetadata"):
            result_data["usage"] = result["usageMetadata"]

        self.status = f"✅ Gemini 已生成 {len(images)} 张图片"
        return Data(data=result_data, type="image")

    @staticmethod
    def _gemini_image_size_from_resolution(resolution: str | None) -> str | None:
        if not resolution:
            return None
        label = str(resolution)
        if "4K" in label:
            return "4K"
        if "2K" in label:
            return "2K"
        if "1K" in label:
            return "1K"
        return None

    @staticmethod
    def _get_image_dimensions_from_data_url(data_url: str) -> tuple[int, int] | tuple[None, None]:
        """从 data URL 获取图片尺寸"""
        try:
            if not data_url or not data_url.startswith("data:") or ";base64," not in data_url:
                return None, None

            header, encoded = data_url.split(";base64,", 1)
            image_bytes = base64.b64decode(encoded)

            # 使用 PIL 获取尺寸
            from PIL import Image
            img = Image.open(io.BytesIO(image_bytes))
            return img.size
        except Exception:
            return None, None

    @staticmethod
    def _process_gemini_image(data_url: str) -> str | None:
        """处理 Gemini 返回的图片，尝试去除 C2PA 签名或优化格式。

        Gemini Nano Banana Pro 返回的图片可能包含 C2PA 签名，
        这会导致图片文件过大或某些浏览器无法正确显示。
        此方法尝试重新编码图片以去除元数据。
        """
        if not data_url or not data_url.startswith("data:"):
            return None

        try:
            # 分离 MIME 类型和 base64 数据
            if ";base64," not in data_url:
                return None
            header, encoded = data_url.split(";base64,", 1)
            mime_type = header.replace("data:", "").strip() or "image/jpeg"

            # 解码 base64
            image_bytes = base64.b64decode(encoded)

            # 尝试使用 PIL 重新编码图片（去除 C2PA 签名等元数据）
            try:
                from PIL import Image
                print(f"[Gemini Image Process] PIL imported successfully")
                print(f"[Gemini Image Process] Decoded {len(image_bytes)} bytes from base64")

                # 从字节流加载图片
                img = Image.open(io.BytesIO(image_bytes))
                print(f"[Gemini Image Process] Image opened: size={img.size}, mode={img.mode}, format={img.format}")

                # 转换为 RGB（如果是 RGBA）
                if img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                    img = background
                elif img.mode not in ('RGB', 'L'):
                    img = img.convert('RGB')

                # 保存到字节流（去除所有元数据）
                output = io.BytesIO()
                img.save(output, format='JPEG', quality=95, optimize=True)
                output.seek(0)
                processed_bytes = output.getvalue()

                # 重新编码为 base64
                processed_encoded = base64.b64encode(processed_bytes).decode('utf-8')
                processed_url = f"data:image/jpeg;base64,{processed_encoded}"

                print(f"[Gemini Image Process] Original: {len(image_bytes)} bytes -> Processed: {len(processed_bytes)} bytes")
                return processed_url

            except ImportError:
                print("[Gemini Image Process] PIL not available, skipping processing")
                return None
            except Exception as e:
                print(f"[Gemini Image Process] PIL processing failed: {e}")
                return None

        except Exception as e:
            print(f"[Gemini Image Process] Failed to process image: {e}")
            return None

    @staticmethod
    def _gemini_inline_part_from_data_url(data_url: str) -> dict[str, Any] | None:
        if not data_url:
            return None
        trimmed = data_url.strip()
        if not trimmed.startswith("data:") or ";base64," not in trimmed:
            raise ValueError("Gemini 参考图必须为 data:*;base64, 格式。")
        header, encoded = trimmed.split(";base64,", 1)
        mime_type = header.replace("data:", "").strip() or "image/png"
        encoded = encoded.strip()
        if not encoded:
            return None
        return {"inlineData": {"mimeType": mime_type, "data": encoded}}

    @staticmethod
    def _extract_gemini_images_and_text(result: Any) -> tuple[list[str], str]:
        if not isinstance(result, dict):
            return [], ""
        candidates = result.get("candidates") or []
        if not isinstance(candidates, list) or not candidates:
            return [], ""
        first = candidates[0]
        if not isinstance(first, dict):
            return [], ""
        content = first.get("content") or {}
        parts = content.get("parts") or []
        if not isinstance(parts, list):
            return [], ""

        images: list[str] = []
        texts: list[str] = []
        for part in parts:
            if not isinstance(part, dict):
                continue
            if part.get("thought") is True:
                continue
            text_value = part.get("text")
            if isinstance(text_value, str) and text_value.strip():
                texts.append(text_value.strip())

            inline = part.get("inlineData") or part.get("inline_data")
            if not isinstance(inline, dict):
                continue
            data = inline.get("data")
            if not isinstance(data, str) or not data.strip():
                continue
            mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
            images.append(f"data:{mime};base64,{data.strip()}")

        return images, "\n".join(texts).strip()

    def _build_images_dashscope(self, *, prompt: str, model_meta: dict[str, Any]) -> Data:
        try:
            resolution = self.resolution or "2K（推荐）"
            aspect_ratio = self.aspect_ratio or "1:1"
            image_count = int(self.image_count or 1)
            image_count = max(1, min(image_count, 4))

            negative_prompt = (getattr(self, "negative_prompt", "") or "").strip()
            seed = int(getattr(self, "seed", 0) or 0)
            prompt_extend = bool(getattr(self, "prompt_extend", True))
            watermark = bool(getattr(self, "watermark", False))

            max_refs = int(model_meta.get("max_reference_images") or 4)
            reference_payloads, reference_meta = self._prepare_reference_images(
                max_reference_images=max_refs,
                allowed_extensions=set(self.DASHSCOPE_ALLOWED_IMAGE_EXTENSIONS),
            )
            has_reference_images = bool(reference_payloads)
            adaptive_ratio = str(aspect_ratio).lower() == "adaptive"
            if adaptive_ratio and not has_reference_images:
                raise ValueError("选择 adaptive 时需要至少上传 1 张参考图。")

            size_info: dict[str, Any]
            size_value: str | None
            if adaptive_ratio and has_reference_images:
                size_value = None
                size_info = {
                    "label": "adaptive",
                    "size_value": None,
                    "width": None,
                    "height": None,
                    "ratio": "adaptive",
                    "base_resolution": resolution,
                }
            else:
                size_info = self._resolve_size(
                    model_meta,
                    resolution_key=resolution,
                    ratio_key=aspect_ratio,
                    provider="dashscope",
                    has_reference_images=has_reference_images,
                )
                size_value = str(size_info["size_value"])
        except ValueError as exc:
            return self._error(str(exc))

        creds = resolve_credentials(
            component_app_id=None,
            component_access_token=None,
            component_api_key=self.api_key,
            provider="dashscope",
            env_api_key_var="DASHSCOPE_API_KEY",
        )
        api_key = (creds.api_key or "").strip().strip("'").strip('"')
        if api_key.lower().startswith("bearer "):
            api_key = api_key.split(" ", 1)[1].strip()
        if api_key.startswith("****"):
            return self._error(
                "检测到 Provider Credentials 中保存了被掩码的 api_key（形如****1234），"
                "这不是有效的 DashScope key。请在 Provider Credentials 中重新粘贴完整 DASHSCOPE_API_KEY 保存。"
            )
        if not api_key:
            return self._error("未检测到 DASHSCOPE_API_KEY，请在 .env 或 Provider Credentials 中配置。")

        is_i2i = has_reference_images
        dashscope_model = model_meta.get("i2i_model") if is_i2i else model_meta.get("t2i_model")
        if not dashscope_model:
            return self._error("未匹配到 wan 模型 ID，请检查配置。")

        if bool(model_meta.get("supports_sync")):
            return self._dashscope_sync_generate(
                api_key=api_key,
                model=str(dashscope_model),
                prompt=prompt,
                images=reference_payloads,
                negative_prompt=negative_prompt,
                seed=seed,
                prompt_extend=prompt_extend,
                watermark=watermark,
                image_count=image_count,
                size=size_value,
                enable_interleave=False if is_i2i else None,
                reference_meta=reference_meta,
                size_info=size_info,
            )

        endpoint = (
            f"{self.DASHSCOPE_API_BASE}/api/v1/services/aigc/image2image/image-synthesis"
            if is_i2i
            else f"{self.DASHSCOPE_API_BASE}/api/v1/services/aigc/text2image/image-synthesis"
        )
        return self._dashscope_async_generate_old_protocol(
            api_key=api_key,
            endpoint=endpoint,
            model=str(dashscope_model),
            prompt=prompt,
            images=reference_payloads,
            negative_prompt=negative_prompt,
            seed=seed,
            prompt_extend=prompt_extend,
            watermark=watermark,
            image_count=image_count,
            size=size_value,
            reference_meta=reference_meta,
            size_info=size_info,
        )

    def _dashscope_sync_generate(
        self,
        *,
        api_key: str,
        model: str,
        prompt: str,
        images: list[str],
        negative_prompt: str,
        seed: int,
        prompt_extend: bool,
        watermark: bool,
        image_count: int,
        size: str | None,
        enable_interleave: bool | None,
        reference_meta: list[dict[str, Any]],
        size_info: dict[str, Any],
    ) -> Data:
        url = f"{self.DASHSCOPE_API_BASE}/api/v1/services/aigc/multimodal-generation/generation"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}

        content: list[dict[str, Any]] = [{"text": prompt}]
        for image in images:
            content.append({"image": image})

        parameters: dict[str, Any] = {
            "prompt_extend": prompt_extend,
            "watermark": watermark,
            "n": image_count,
        }
        if size:
            parameters["size"] = size
        if enable_interleave is not None:
            parameters["enable_interleave"] = enable_interleave
        if negative_prompt:
            parameters["negative_prompt"] = negative_prompt
        if seed > 0:
            parameters["seed"] = seed

        payload = {
            "model": model,
            "input": {"messages": [{"role": "user", "content": content}]},
            "parameters": parameters,
        }

        self.status = "🎨 wan 模型提交成功，等待生成..."
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=float(self.timeout_seconds or 600.0))
        except Exception as exc:
            return self._error(f"wan 调用失败：{exc}")

        if not response.ok:
            return self._error(f"wan 调用失败：HTTP {response.status_code}：{response.text}")

        try:
            data = response.json()
        except Exception as exc:  # noqa: BLE001
            return self._error(f"wan 响应解析失败：{exc}")

        output = data.get("output") or {}
        images_out: list[dict[str, Any]] = []
        for choice in (output.get("choices") or []):
            message = (choice or {}).get("message") or {}
            for block in (message.get("content") or []):
                if isinstance(block, dict) and block.get("image"):
                    images_out.append({"url": block.get("image")})

        if not images_out:
            return self._error("wan 响应中未获取到图片结果，请检查提示词/参考图输入。")

        token = str(uuid4())
        generated_at = datetime.now(timezone.utc).isoformat()
        preview_payload = {
            "images": [{"url": entry["url"], "label": f"Image {idx + 1}"} for idx, entry in enumerate(images_out)]
        }
        doubao_preview = {
            "token": token,
            "kind": "image",
            "available": True,
            "generated_at": generated_at,
            "payload": preview_payload,
        }

        result_data: dict[str, Any] = {
            "provider": "dashscope",
            "prompt": prompt,
            "model": self.model_name,
            "model_id": model,
            "size": size_info.get("label") or size,
            "aspect_ratio": self.aspect_ratio,
            "generated_images": images_out,
            "reference_images": reference_meta,
            "doubao_preview": doubao_preview,
            "dashscope_request_id": data.get("request_id"),
        }
        usage = data.get("usage")
        if isinstance(usage, dict):
            result_data["usage"] = usage

        return Data(data=result_data, type="image")

    def _dashscope_async_generate_old_protocol(
        self,
        *,
        api_key: str,
        endpoint: str,
        model: str,
        prompt: str,
        images: list[str],
        negative_prompt: str,
        seed: int,
        prompt_extend: bool,
        watermark: bool,
        image_count: int,
        size: str | None,
        reference_meta: list[dict[str, Any]],
        size_info: dict[str, Any],
    ) -> Data:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "X-DashScope-Async": "enable",
        }

        input_body: dict[str, Any] = {"prompt": prompt}
        if images:
            input_body["images"] = images
        if negative_prompt:
            input_body["negative_prompt"] = negative_prompt

        parameters: dict[str, Any] = {
            "n": image_count,
            "prompt_extend": prompt_extend,
            "watermark": watermark,
        }
        if size:
            parameters["size"] = size
        if seed > 0:
            parameters["seed"] = seed

        payload = {"model": model, "input": input_body, "parameters": parameters}

        self.status = "🎨 wan 模型提交成功，等待生成..."
        try:
            response = requests.post(endpoint, headers=headers, json=payload, timeout=float(self.timeout_seconds or 600.0))
        except Exception as exc:
            return self._error(f"wan 调用失败：{exc}")

        if not response.ok:
            return self._error(f"wan 调用失败：HTTP {response.status_code}：{response.text}")

        try:
            data = response.json()
        except Exception as exc:  # noqa: BLE001
            return self._error(f"wan 响应解析失败：{exc}")

        output = data.get("output") or {}
        task_id = output.get("task_id") or output.get("taskId")
        if not task_id:
            return self._error(f"wan 未返回 task_id：{data}")

        return self._dashscope_poll_task(
            api_key=api_key,
            task_id=str(task_id),
            model=model,
            reference_meta=reference_meta,
            size_info=size_info,
        )

    def _dashscope_poll_task(
        self,
        *,
        api_key: str,
        task_id: str,
        model: str,
        reference_meta: list[dict[str, Any]],
        size_info: dict[str, Any],
    ) -> Data:
        url = f"{self.DASHSCOPE_API_BASE}/api/v1/tasks/{task_id}"
        headers = {"Authorization": f"Bearer {api_key}"}
        deadline = time.time() + float(self.timeout_seconds or 600.0)

        last_status: str | None = None
        while time.time() < deadline:
            try:
                response = requests.get(url, headers=headers, timeout=min(float(self.timeout_seconds or 600.0), 30.0))
            except Exception as exc:
                return self._error(f"wan 轮询失败：{exc}")

            if not response.ok:
                return self._error(f"wan 轮询失败：HTTP {response.status_code}：{response.text}")

            try:
                data = response.json()
            except Exception as exc:  # noqa: BLE001
                return self._error(f"wan 轮询响应解析失败：{exc}")

            output = data.get("output") or {}
            status = str(output.get("task_status") or output.get("taskStatus") or "").upper()
            if status and status != last_status:
                last_status = status
                self.status = f"⏳ wan 轮询中：{status}"

            if status in {"PENDING", "RUNNING", ""}:
                time.sleep(self.DASHSCOPE_POLL_INTERVAL_SECONDS)
                continue

            results = output.get("results") or []
            images_out: list[dict[str, Any]] = []
            if isinstance(results, list):
                for item in results:
                    if isinstance(item, dict) and item.get("url"):
                        images_out.append({"url": item.get("url"), "actual_prompt": item.get("actual_prompt")})

            if status in {"SUCCEEDED", "PARTIAL_SUCCEEDED"} and images_out:
                token = str(uuid4())
                generated_at = datetime.now(timezone.utc).isoformat()
                preview_payload = {
                    "images": [
                        {"url": entry["url"], "label": f"Image {idx + 1}", "actual_prompt": entry.get("actual_prompt")}
                        for idx, entry in enumerate(images_out)
                    ]
                }
                doubao_preview = {
                    "token": token,
                    "kind": "image",
                    "available": True,
                    "generated_at": generated_at,
                    "payload": preview_payload,
                }

                result_data: dict[str, Any] = {
                    "provider": "dashscope",
                    "model": self.model_name,
                    "model_id": model,
                    "task_id": task_id,
                    "task_status": status,
                    "size": size_info.get("label") or size_info.get("size_value"),
                    "aspect_ratio": self.aspect_ratio,
                    "generated_images": images_out,
                    "reference_images": reference_meta,
                    "doubao_preview": doubao_preview,
                    "dashscope_request_id": data.get("request_id"),
                }
                usage = data.get("usage")
                if isinstance(usage, dict):
                    result_data["usage"] = usage
                return Data(data=result_data, type="image")

            message = data.get("message") or output.get("message") or ""
            code = data.get("code") or output.get("code") or ""
            return self._error(f"wan 任务失败：{status} {code} {message}".strip())

        return self._error("wan 任务超时，请增大 Timeout Seconds 或稍后重试。")

    def _resolve_size(
        self,
        model_meta: dict[str, Any],
        resolution_key: str,
        ratio_key: str,
        *,
        provider: str = "ark",
        has_reference_images: bool = False,  # noqa: FBT001,FBT002
    ) -> dict[str, Any]:
        base = self.RESOLUTION_PRESETS.get(resolution_key)
        if not base:
            raise ValueError("请选择有效的分辨率。")
        ratio = self.ASPECT_RATIOS.get(ratio_key)
        if not ratio:
            raise ValueError("请选择有效的图像比例。")

        width, height = self._calculate_dimensions(base, ratio)
        if provider == "dashscope":
            width, height = self._enforce_area_constraints_dashscope(model_meta, width, height, has_reference_images)
            label = f"{width}×{height}"
            size_value = f"{width}*{height}"
        else:
            width, height = self._enforce_area_constraints(model_meta, width, height)
            label = f"{width}×{height}"
            size_value = f"{width}x{height}"
        return {
            "label": label,
            "size_value": size_value,
            "width": width,
            "height": height,
            "ratio": ratio_key,
            "base_resolution": resolution_key,
        }

    def _calculate_dimensions(self, base: int, ratio: tuple[int, int]) -> tuple[int, int]:
        rw, rh = ratio
        if rw >= rh:
            width = base
            height = max(64, int(round(base * rh / rw)))
        else:
            height = base
            width = max(64, int(round(base * rw / rh)))
        return width, height

    def _enforce_area_constraints(
        self, model_meta: dict[str, Any], width: int, height: int
    ) -> tuple[int, int]:
        min_area = model_meta.get("min_area")
        max_area = model_meta.get("max_area", 16_777_216)
        area = width * height

        if min_area and area < min_area:
            scale = (min_area / area) ** 0.5
            width = int(width * scale)
            height = int(height * scale)
        area = width * height
        if max_area and area > max_area:
            scale = (max_area / area) ** 0.5
            width = int(width * scale)
            height = int(height * scale)

        width = min(4096, self._round_dimension(width))
        height = min(4096, self._round_dimension(height))
        return width, height

    def _enforce_area_constraints_dashscope(
        self,
        model_meta: dict[str, Any],
        width: int,
        height: int,
        has_reference_images: bool,  # noqa: FBT001
    ) -> tuple[int, int]:
        if has_reference_images:
            min_area = int(model_meta.get("i2i_min_area") or 768 * 768)
            max_area = int(model_meta.get("i2i_max_area") or 1280 * 1280)
        else:
            min_area = int(model_meta.get("t2i_min_area") or 1280 * 1280)
            max_area = int(model_meta.get("t2i_max_area") or 1440 * 1440)

        area = width * height
        if area <= 0:
            return (1280, 1280)

        if min_area and area < min_area:
            scale = (min_area / area) ** 0.5
            width = int(round(width * scale))
            height = int(round(height * scale))
            area = width * height

        if max_area and area > max_area:
            scale = (max_area / area) ** 0.5
            width = int(round(width * scale))
            height = int(round(height * scale))

        width = max(1, width)
        height = max(1, height)
        return (width, height)

    @staticmethod
    def _round_dimension(value: int) -> int:
        multiple = 64
        return max(multiple, int(round(value / multiple) * multiple))

    def _prepare_reference_images(
        self,
        *,
        max_reference_images: int | None = None,
        allowed_extensions: set[str] | None = None,
    ) -> tuple[list[str], list[dict[str, Any]]]:
        uploads = getattr(self, "reference_images", None)
        if not uploads:
            return [], []

        raw_items = uploads if isinstance(uploads, list) else [uploads]
        limit = int(max_reference_images or self.MAX_REFERENCE_IMAGES)
        return self._prepare_reference_images_from_items(
            raw_items,
            limit=limit,
            allowed_extensions=allowed_extensions,
        )

    def _prepare_reference_images_from_value(
        self,
        value: Any,
        *,
        max_reference_images: int | None = None,
        allowed_extensions: set[str] | None = None,
    ) -> tuple[list[str], list[dict[str, Any]]]:
        if not value:
            return [], []
        raw_items = value if isinstance(value, list) else [value]
        limit = int(max_reference_images or self.MAX_REFERENCE_IMAGES)
        return self._prepare_reference_images_from_items(
            raw_items,
            limit=limit,
            allowed_extensions=allowed_extensions,
        )

    def _prepare_reference_images_from_items(
        self,
        raw_items: list[Any],
        *,
        limit: int,
        allowed_extensions: set[str] | None = None,
    ) -> tuple[list[str], list[dict[str, Any]]]:
        if limit <= 0:
            return [], []
        if len(raw_items) > limit:
            raise ValueError(f"最多支持上传 {limit} 张参考图。")

        payloads: list[str] = []
        metadata: list[dict[str, Any]] = []

        for item in raw_items:
            if len(payloads) >= limit:
                break
            if self._try_append_data_payloads(item, payloads, metadata, limit=limit):
                continue
            path_value = self._extract_file_path(item)
            if not path_value:
                continue

            resolved = self.resolve_path(path_value)
            file_path = Path(resolved)
            if not file_path.exists() and "/" in path_value:
                try:
                    resolved = self.get_full_path(path_value)
                    file_path = Path(resolved)
                except Exception:
                    pass
            if not file_path.exists():
                raise ValueError(f"未找到图片：{path_value}")

            file_size = file_path.stat().st_size
            if file_size > self.MAX_REFERENCE_FILE_SIZE:
                raise ValueError(f"图片 {file_path.name} 超过 10MB 上限。")

            if allowed_extensions:
                suffix = file_path.suffix.lower().lstrip(".")
                if suffix and suffix not in allowed_extensions:
                    allowed_str = ", ".join(sorted(allowed_extensions))
                    raise ValueError(f"图片 {file_path.name} 不支持，允许类型：{allowed_str}")

            mime_type, _ = mimetypes.guess_type(file_path.name)
            mime_type = mime_type or "image/png"

            with file_path.open("rb") as fp:
                encoded = base64.b64encode(fp.read()).decode("utf-8")

            payloads.append(f"data:{mime_type};base64,{encoded}")
            metadata.append(
                {
                    "filename": file_path.name,
                    "mime_type": mime_type,
                    "size_bytes": file_size,
                    "source_path": str(file_path),
                }
            )

        return payloads, metadata

    def _try_append_data_payloads(
        self,
        item: Any,
        payloads: list[str],
        metadata: list[dict[str, Any]],
        *,
        limit: int | None = None,
    ) -> bool:
        containers = self._collect_reference_containers(item)
        effective_limit = int(limit or self.MAX_REFERENCE_IMAGES)
        appended = False
        for container in containers:
            if len(payloads) >= effective_limit:
                break
            inline_value = self._first_non_empty(
                container,
                ["image_data_url", "data_url", "preview_base64", "image_base64"],
            )
            if inline_value:
                normalized = self._normalize_reference_data_url(inline_value)
                if normalized:
                    payloads.append(normalized)
                    metadata.append(
                        {
                            "filename": container.get("filename")
                            or container.get("file_name")
                            or container.get("label")
                            or "reference.png",
                            "source": container.get("origin", "data_handle"),
                            "width": container.get("width"),
                            "height": container.get("height"),
                        }
                    )
                    appended = True
                    continue

            url_value = self._first_non_empty(
                container,
                ["image_url", "edited_image_url", "url"],
            )
            if url_value:
                inline_data, meta = self._download_reference_from_url(str(url_value))
                if inline_data:
                    payloads.append(inline_data)
                    metadata.append(meta)
                    appended = True
        return appended

    def _collect_reference_containers(self, item: Any) -> list[dict[str, Any]]:
        containers: list[dict[str, Any]] = []

        def enqueue(candidate: Any) -> None:
            if isinstance(candidate, Data):
                enqueue(candidate.data)
                return
            if not isinstance(candidate, dict):
                return
            containers.append(candidate)
            nested_candidates = []
            for key in ("images", "generated_images", "reference_images", "doubao_preview", "items", "payload"):
                value = candidate.get(key)
                if isinstance(value, list):
                    nested_candidates.extend(value)
                elif isinstance(value, dict):
                    nested_candidates.append(value)
            for nested in nested_candidates:
                enqueue(nested)

        enqueue(item)
        return containers

    @staticmethod
    def _first_non_empty(container: dict[str, Any], keys: list[str]) -> str | None:
        for key in keys:
            value = container.get(key)
            if isinstance(value, str):
                stripped = value.strip()
                if stripped:
                    return stripped
        return None

    @staticmethod
    def _normalize_reference_data_url(value: str | None) -> str | None:
        if not value:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        if trimmed.startswith("data:"):
            return trimmed
        try:
            base64.b64decode(trimmed)
            return f"data:image/png;base64,{trimmed}"
        except Exception:
            return None

    def _download_reference_from_url(self, url: str) -> tuple[str | None, dict[str, Any]]:
        try:
            response = requests.get(url, timeout=self.PREVIEW_TIMEOUT)
            response.raise_for_status()
            if len(response.content) > self.MAX_REFERENCE_FILE_SIZE:
                return None, {
                    "warning": f"参考图超过 {self.MAX_REFERENCE_FILE_SIZE // (1024 * 1024)}MB",
                    "source_url": url,
                }
            mime_type = response.headers.get("Content-Type", "image/png").split(";")[0]
            encoded = base64.b64encode(response.content).decode("utf-8")
            filename = Path(urlparse(url).path).name or "reference.png"
            return (
                f"data:{mime_type};base64,{encoded}",
                {
                    "filename": filename,
                    "mime_type": mime_type,
                    "size_bytes": len(response.content),
                    "source_url": url,
                },
            )
        except Exception as exc:
            return None, {"error": f"下载参考图失败：{exc}", "source_url": url}

    @staticmethod
    def _extract_file_path(value: Any) -> str | None:
        if not value:
            return None
        if isinstance(value, Data):
            return DoubaoImageCreator._extract_file_path(value.data)
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        if isinstance(value, (list, tuple)):
            for item in value:
                candidate = DoubaoImageCreator._extract_file_path(item)
                if candidate:
                    return candidate
            return None
        if isinstance(value, dict):
            candidate = value.get("file_path") or value.get("path") or value.get("value")
            return DoubaoImageCreator._extract_file_path(candidate)
        return str(value).strip() or None

    def _download_preview(self, url: str) -> tuple[str | None, str | None]:
        try:
            response = requests.get(url, timeout=self.PREVIEW_TIMEOUT)
            response.raise_for_status()
            content_length = len(response.content)
            if content_length > self.PREVIEW_MAX_BYTES:
                return None, "预览跳过：图片体积超过 6MB"
            content_type = response.headers.get("Content-Type", "image/jpeg")
            base64_data = base64.b64encode(response.content).decode("utf-8")
            return f"data:{content_type};base64,{base64_data}", None
        except requests.RequestException as exc:
            return None, f"预览下载失败：{exc}"

    @staticmethod
    def _parse_size(size_text: str | None) -> tuple[int | None, int | None]:
        if not size_text or "x" not in size_text:
            return None, None
        try:
            width_str, height_str = size_text.lower().split("x", 1)
            return int(width_str), int(height_str)
        except ValueError:
            return None, None

    def _resolve_gemini_api_key(self) -> str:
        """Resolve Gemini API key from providers (gemini → google), then env vars, then node param.

        Priority:
        1. Provider Credentials: gemini → google (NOT default)
        2. Environment variables: GEMINI_API_KEY → GOOGLE_API_KEY
        3. Node parameter: self.api_key
        """
        candidates: list[str] = []

        # 1. 从 Provider Credentials 读取（仅 gemini 和 google，不读取 default）
        try:  # pragma: no cover - runtime dependency
            from langflow.services.deps import get_settings_service

            settings_service = get_settings_service()
            config_dir = settings_service.settings.config_dir

            # 尝试读取 gemini provider
            gemini_creds = get_provider_credentials("gemini", config_dir)
            if gemini_creds and gemini_creds.api_key and not gemini_creds.api_key.strip().startswith("****"):
                candidates.append(gemini_creds.api_key.strip())

            # 尝试读取 google provider
            google_creds = get_provider_credentials("google", config_dir)
            if google_creds and google_creds.api_key and not google_creds.api_key.strip().startswith("****"):
                candidates.append(google_creds.api_key.strip())
        except Exception:
            pass

        # 2. 从环境变量读取
        gemini_env = os.getenv("GEMINI_API_KEY", "").strip()
        if gemini_env:
            candidates.append(gemini_env)
        google_env = os.getenv("GOOGLE_API_KEY", "").strip()
        if google_env:
            candidates.append(google_env)

        # 3. 从节点参数读取
        node_key = (getattr(self, "api_key", None) or "").strip()
        if node_key and not node_key.startswith("****"):
            node_key = node_key.strip("'").strip('"')
            if node_key.lower().startswith("bearer "):
                node_key = node_key.split(" ", 1)[1].strip()
            if node_key:
                candidates.append(node_key)

        # 返回第一个有效的 API Key
        for key in candidates:
            if key:
                return key
        return ""

    @staticmethod
    def _error(message: str) -> Data:
        generated_at = datetime.now(timezone.utc).isoformat()
        suggestion = ""
        lowered = message.lower()
        if "connection error" in lowered or "connect" in lowered:
            suggestion = (
                "（网络连接错误：请检查是否能访问 Ark 地址，或是否需要设置代理 HTTP_PROXY/HTTPS_PROXY，"
                "以及防火墙/证书拦截等）"
            )
        return Data(
            data={
                "error": f"{message}{suggestion}",
                "doubao_preview": {
                    "token": f"error-{uuid4().hex[:8]}",
                    "kind": "image",
                    "available": False,
                    "generated_at": generated_at,
                    "payload": None,
                    "error": f"{message}{suggestion}",
                },
            },
            type="error",
        )

    def _merge_prompt(self, prompt_source: Any | None) -> str:
        parts: list[str] = []

        def _append_value(value: Any | None) -> None:
            if value is None:
                return
            if isinstance(value, (list, tuple, set)):
                for item in value:
                    _append_value(item)
                return
            try:
                if hasattr(value, "get_text"):
                    text_value = value.get_text()
                elif hasattr(value, "text"):
                    text_value = value.text
                else:
                    text_value = value
            except Exception:
                text_value = value

            if isinstance(text_value, bytes):
                text_value = text_value.decode("utf-8", errors="ignore")

            text_str = str(text_value or "").strip()
            if text_str:
                parts.append(text_str)

        _append_value(prompt_source)
        return "\n".join(parts).strip()


if __name__ == "__main__":
    print("DoubaoImageCreator component ready.")
