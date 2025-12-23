"""即梦图片创作 LFX 组件"""

from __future__ import annotations

import base64
import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from typing import Any
from uuid import uuid4

import requests
from dotenv import load_dotenv
from volcenginesdkarkruntime import Ark
from volcenginesdkarkruntime.types.images.images import SequentialImageGenerationOptions

from lfx.custom.custom_component.component import Component
from lfx.field_typing.range_spec import RangeSpec
from lfx.inputs.inputs import DropdownInput, FileInput, IntInput, MultilineInput, SecretStrInput
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
        }
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
    }

    MAX_REFERENCE_IMAGES = 14
    MAX_REFERENCE_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    PREVIEW_MAX_BYTES = 6 * 1024 * 1024
    PREVIEW_TIMEOUT = 20

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
            required=True,
            value="",
            placeholder="示例：充满电影感的城市夜景，霓虹灯反射，主角穿着未来主义机甲。",
            info="支持中文/英文，亦可通过上游节点传入 Message/Data/Text。",
            input_types=["Message", "Data", "Text"],
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
            display_name="Doubao API Key",
            value=os.getenv("ARK_API_KEY", ""),
            placeholder="留空时读取 .env 中的 ARK_API_KEY",
            info="即梦/豆包控制台生成的 API Key，将直接透传至 Ark SDK。",
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
        if not prompt:
            return self._error("提示词不能为空，请输入或连接上游节点。")

        creds = resolve_credentials(
            component_app_id=None,
            component_access_token=None,
            component_api_key=self.api_key,
            env_api_key_var="ARK_API_KEY",
        )
        api_key = (creds.api_key or "").strip()
        if not api_key:
            return self._error("未检测到 Doubao API Key，请在节点或 .env 中配置 ARK_API_KEY。")

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

        client = Ark(
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            api_key=api_key,
        )

        request_kwargs: dict[str, Any] = {
            "model": model_meta["model_id"],
            "prompt": prompt,
            "size": size_info["size_value"],
            "response_format": "url",
            "watermark": False,
            "sequential_image_generation": "auto",
        }
        if image_count > 1:
            request_kwargs["sequential_image_generation_options"] = SequentialImageGenerationOptions(
                max_images=image_count
            )
        if reference_payloads:
            request_kwargs["image"] = reference_payloads

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

    def _resolve_size(self, model_meta: dict[str, Any], resolution_key: str, ratio_key: str) -> dict[str, Any]:
        base = self.RESOLUTION_PRESETS.get(resolution_key)
        if not base:
            raise ValueError("请选择有效的分辨率。")
        ratio = self.ASPECT_RATIOS.get(ratio_key)
        if not ratio:
            raise ValueError("请选择有效的图像比例。")

        width, height = self._calculate_dimensions(base, ratio)
        width, height = self._enforce_area_constraints(model_meta, width, height)
        label = f"{width}×{height}"
        return {
            "label": label,
            "size_value": f"{width}x{height}",
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

    @staticmethod
    def _round_dimension(value: int) -> int:
        multiple = 64
        return max(multiple, int(round(value / multiple) * multiple))

    def _prepare_reference_images(self) -> tuple[list[str], list[dict[str, Any]]]:
        uploads = getattr(self, "reference_images", None)
        if not uploads:
            return [], []

        raw_items = uploads if isinstance(uploads, list) else [uploads]
        if len(raw_items) > self.MAX_REFERENCE_IMAGES:
            raise ValueError(f"最多支持上传 {self.MAX_REFERENCE_IMAGES} 张参考图。")

        payloads: list[str] = []
        metadata: list[dict[str, Any]] = []

        for item in raw_items:
            if len(payloads) >= self.MAX_REFERENCE_IMAGES:
                break
            if self._try_append_data_payloads(item, payloads, metadata):
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
    ) -> bool:
        containers = self._collect_reference_containers(item)
        appended = False
        for container in containers:
            if len(payloads) >= self.MAX_REFERENCE_IMAGES:
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
        return Data(data={"error": message}, type="error")

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
