"""即梦图片创作 LFX 组件"""

from __future__ import annotations

import base64
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
        },
        "Nano Banana Pro": {
            "provider": "gemini",
            "model_id": "gemini-3-pro-image-preview",
            "max_reference_images": 14,
            "max_high_fidelity_reference_images": 5,
            "supports_image_size": True,
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
    }

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
    GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

    inputs = [
        DropdownInput(
            name="model_name",
            display_name="模型选择",
            options=list(MODEL_CATALOG.keys()),
            value="Seedream 4.5 · 旗舰 (251128)",
            required=True,
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

    def build_images(self) -> Data:
        prompt = self._merge_prompt(self.prompt)
        model_meta = self.MODEL_CATALOG.get(self.model_name)
        if not model_meta:
            return self._error("未匹配到可用模型，请重新选择。")

        if model_meta.get("provider") == "gemini":
            return self._build_images_gemini(prompt=prompt, model_meta=model_meta)

        is_dashscope = "t2i_model" in model_meta or "i2i_model" in model_meta
        if not prompt:
            uploads = getattr(self, "reference_images", None)
            if uploads:
                try:
                    max_refs = int(model_meta.get("max_reference_images") or self.MAX_REFERENCE_IMAGES)
                    payloads, metadata = self._prepare_reference_images(
                        max_reference_images=max_refs,
                        allowed_extensions=set(self.DASHSCOPE_ALLOWED_IMAGE_EXTENSIONS) if is_dashscope else None,
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

        if is_dashscope:
            return self._build_images_dashscope(prompt=prompt, model_meta=model_meta)

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

        creds = resolve_credentials(
            component_app_id=None,
            component_access_token=None,
            component_api_key=self.api_key,
            provider="gemini",
            env_api_key_var="GEMINI_API_KEY",
        )
        api_key = (creds.api_key or "").strip().strip("'").strip('"')
        if api_key.lower().startswith("bearer "):
            api_key = api_key.split(" ", 1)[1].strip()
        if not api_key:
            api_key = os.getenv("GOOGLE_API_KEY", "").strip()
        if api_key.startswith("****"):
            return self._error("检测到被掩码的 Gemini API Key（形如 ****1234），请重新配置完整 key。")
        if not api_key:
            return self._error("未检测到 GEMINI_API_KEY/GOOGLE_API_KEY，请在 .env 或 Provider Credentials 中配置。")

        warnings: list[str] = []

        draft_payload = getattr(self, "draft_output", None)
        if isinstance(draft_payload, Data):
            draft_payload = draft_payload.data

        # History: take the last preview output (persisted by the frontend) as extra input images.
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
            generated_at = datetime.now(timezone.utc).isoformat()
            preview_gallery = [
                {"index": index, "image_data_url": data_url, "ratio": aspect_ratio}
                for index, data_url in enumerate(input_images)
            ]
            payload = {
                "bridge_mode": True,
                "images": preview_gallery,
                "model": {"name": self.model_name, "model_id": model_id},
                "warnings": warnings or None,
            }
            payload["doubao_preview"] = {
                "token": f"{self.name}-bridge",
                "kind": "image",
                "available": bool(preview_gallery),
                "generated_at": generated_at,
                "payload": payload,
            }
            self.status = "🔁 桥梁模式：提示词为空，直通预览输出"
            return Data(data=payload, type="image")

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

        payload: dict[str, Any] = {
            "contents": [{"parts": parts}],
            "generationConfig": generation_config,
        }

        url = f"{self.GEMINI_API_BASE}/models/{model_id}:generateContent"
        headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}

        # 调试日志（可选）
        import json
        self.status = f"🍌 调用 Gemini API: {model_id}"
        print(f"[Gemini Debug] Payload: {json.dumps(payload, indent=2, ensure_ascii=False)[:1000]}...")

        self.status = "🍌 Gemini 模型提交成功，等待生成..."
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=180)
            response.raise_for_status()
            result = response.json()
        except requests.HTTPError as exc:
            # 尝试获取详细的错误信息
            error_detail = str(exc)
            try:
                if exc.response is not None:
                    error_json = exc.response.json()
                    if "error" in error_json:
                        error_info = error_json["error"]
                        error_detail = f"{error_info.get('status', '')}: {error_info.get('message', '')}"
            except Exception:
                pass
            return self._error(f"Gemini API 调用失败 ({exc.response.status_code if exc.response else 'Unknown'}): {error_detail}")
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gemini 调用失败：{exc}")

        images, text = self._extract_gemini_images_and_text(result)
        if not images:
            return self._error("Gemini 未返回可用的图片数据，请检查提示词或稍后重试。")

        generated_images: list[dict[str, Any]] = []
        preview_gallery: list[dict[str, Any]] = []
        for index, data_url in enumerate(images):
            generated_images.append({"index": index, "image_data_url": data_url})
            preview_gallery.append({"index": index, "image_data_url": data_url, "ratio": aspect_ratio})

        generated_at = datetime.now(timezone.utc).isoformat()
        preview_token = f"gemini-{uuid4().hex[:8]}"
        resolved_image_size = (
            self._gemini_image_size_from_resolution(resolution) if supports_image_size else None
        )
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
            for key in ("images", "generated_images", "reference_images", "doubao_preview", "items"):
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
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            return value.get("file_path") or value.get("path") or value.get("value")
        return str(value)

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
