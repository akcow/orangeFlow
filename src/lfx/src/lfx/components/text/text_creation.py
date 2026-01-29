from __future__ import annotations

import os
import base64
import mimetypes
from pathlib import Path
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage

from lfx.custom.custom_component.component import Component
from lfx.inputs.inputs import DropdownInput, MultilineInput, SecretStrInput, StrInput
from lfx.schema.data import Data
from lfx.template.field.base import Output
from lfx.utils.provider_credentials import DEFAULT_PROVIDER_KEY, get_provider_credentials

load_dotenv()

GEMINI3_MODEL_PREFIXES = ("gemini-3-",)


class TextCreation(Component):
    """基于 DeepSeek 的文本创作节点。"""

    display_name = "文本创作"
    description = ""
    icon = "ToyBrick"
    name = "TextCreation"
    category = "text"

    inputs = [
        MultilineInput(
            name="prompt",
            display_name="提示词输入",
            required=False,
            value="",
            placeholder="描述你想要生成的内容，按需使用换行。",
            info="支持中文/英文，可与上游 Message/Data/Text 联动。",
            input_types=["Message", "Data", "Text"],
        ),
        DropdownInput(
            name="model_name",
            display_name="模型选择",
            options=["deepseek-chat", "deepseek-reasoner", "gemini-3-pro-preview", "gemini-3-flash-preview"],
            value="deepseek-chat",
            info="模型选择：DeepSeek / Gemini 3（官方 Model ID）。默认 deepseek-chat。",
        ),
        StrInput(
            name="api_base",
            display_name="API Base",
            value="https://api.deepseek.com/v1",
            advanced=True,
            info="DeepSeek API 基础地址，默认官方地址，需包含 /v1。",
        ),
        SecretStrInput(
            name="api_key",
            display_name="API Key",
            value="",
            placeholder="留空时读取对应环境变量/凭据配置",
            info="可选：覆盖所选模型所需的 API Key（DeepSeek: DEEPSEEK_API_KEY；Gemini 3: GEMINI_API_KEY/GOOGLE_API_KEY）。",
            load_from_db=False,
            show=False,
        ),
        MultilineInput(
            name="draft_text",
            display_name="文本预览",
            show=True,
            required=False,
            value="",
            input_types=["Data"],
        ),
    ]

    outputs = [
        Output(
            name="text_output",
            display_name="文本结果",
            method="generate_text",
            types=["Data"],
        )
    ]

    def generate_text(self) -> Data:
        prompt = self._merge_prompt(self.prompt)
        draft_text = self._merge_prompt(getattr(self, "draft_text", None))
        has_media = self._has_media([self.prompt, getattr(self, "draft_text", None)])

        # Passthrough mode: allow using the preview/draft text without calling the model.
        # This enables downstream nodes (e.g., video generation) to consume the text even when
        # the prompt input is intentionally left empty.
        if not prompt and not has_media:
            generated_at = datetime.now(timezone.utc).isoformat()

            if not draft_text:
                preview_payload = {
                    "token": f"text-{uuid4().hex[:8]}",
                    "kind": "text",
                    "available": False,
                    "generated_at": generated_at,
                    "text": "",
                    "model": "passthrough",
                    "prompt": "",
                }

                self.status = "桥梁模式：提示词为空，空直通"
                return Data(
                    data={
                        "text": "",
                        "prompt": "",
                        "model": "passthrough",
                        "text_preview": preview_payload,
                        "bridge_mode": True,
                    },
                    text_key="text",
                )

            preview_payload = {
                "token": f"text-{uuid4().hex[:8]}",
                "kind": "text",
                "available": True,
                "generated_at": generated_at,
                "text": draft_text,
                "model": "passthrough",
                "prompt": "",
            }

            self.status = "✍️ 使用预览文本（未调用模型）"
            return Data(
                data={
                    "text": draft_text,
                    "prompt": "",
                    "model": "passthrough",
                    "text_preview": preview_payload,
                    "bridge_mode": True,
                },
                text_key="text",
            )

        model_name = self.model_name or "deepseek-chat"

        # Multimodal: route image/video input through Gemini 3 generateContent.
        if has_media:
            if not self._is_gemini3(model_name):
                return self._error("图片/视频输入仅支持 Gemini 模型（gemini-3-*），请切换模型后重试。")
            api_key = (self.api_key or "").strip() or self._resolve_gemini_api_key()
            return self._generate_gemini3_text(
                prompt=prompt,
                model_name=model_name,
                api_key=api_key,
                prompt_source=self.prompt,
                draft_source=getattr(self, "draft_text", None),
                media_expected=True,
            )

        try:
            # Route all model calls through the hosted gateway (server-managed credentials).
            from langflow.gateway.client import chat_completions

            rsp = chat_completions(
                model=model_name,
                messages=[{"role": "user", "content": prompt}],
                stream=False,
                user_id=str(getattr(self, "user_id", "") or "") or None,
            )
            content = (
                (((rsp.get("choices") or [{}])[0] or {}).get("message") or {}).get("content")
                if isinstance(rsp, dict)
                else None
            ) or ""
            usage = rsp.get("usage") if isinstance(rsp, dict) else None
        except Exception as exc:  # noqa: BLE001
            return self._error(f"模型调用失败：{exc}")

        generated_at = datetime.now(timezone.utc).isoformat()
        preview_payload = {
            "token": f"text-{uuid4().hex[:8]}",
            "kind": "text",
            "available": True,
            "generated_at": generated_at,
            "text": content,
            "model": model_name,
            "prompt": prompt,
        }

        result_data: dict[str, Any] = {
            "text": content,
            "prompt": prompt,
            "model": model_name,
            "text_preview": preview_payload,
        }
        if usage:
            result_data["usage"] = usage

        self.status = "✅ 文本生成完成"
        return Data(data=result_data, text_key="text")

    def _generate_gemini3_text(
        self,
        *,
        prompt: str,
        model_name: str,
        api_key: str,
        prompt_source: Any | None = None,
        draft_source: Any | None = None,
        media_expected: bool = False,
    ) -> Data:
        try:
            import requests
        except Exception as exc:  # noqa: BLE001
            return self._error(f"缺少 requests 依赖，请安装后重试：{exc}")

        # 验证 API Key（仅检查是否为空）
        if not api_key or not api_key.strip():
            return self._error("Gemini API Key 未配置。请在 .env 中配置 GEMINI_API_KEY 或在节点中输入。")

        # 使用国内代理地址（注意：路径格式为 models/{model}，不是直接 {model}）
        url = f"https://cdn.12ai.org/v1beta/models/{model_name}:generateContent?key={api_key}"
        headers = {
            "Content-Type": "application/json",
        }

        # 构建 parts：同时考虑纯文本 prompt 与原始多媒体输入（Data/Dict/list）。
        sources: list[Any] = []
        if isinstance(prompt, str) and prompt.strip():
            sources.append(prompt)
        if prompt_source is not None and not (
            isinstance(prompt_source, str) and prompt_source.strip() == (prompt or "").strip()
        ):
            sources.append(prompt_source)
        if draft_source is not None:
            sources.append(draft_source)

        parts = self._build_gemini_parts(sources)
        if media_expected and not any(
            isinstance(part, dict) and "inline_data" in part for part in parts
        ):
            return self._error(
                "检测到多媒体输入，但未提取到可用的图片/视频内容（inline_data）。"
                "如果你传入的是 video_url，请确保该 URL 可访问且大小适合内联。"
            )

        payload = {
            "contents": [
                {
                    "parts": parts,
                }
            ]
        }

        # 添加调试信息
        import json

        # 检查 API Key 来源
        api_key_source = "未知"
        if os.getenv("GEMINI_API_KEY"):
            api_key_source = ".env 文件 (GEMINI_API_KEY)"
        elif os.getenv("GOOGLE_API_KEY"):
            api_key_source = ".env 文件 (GOOGLE_API_KEY)"
        else:
            api_key_source = "未找到 API Key"

        debug_info = {
            "url": url,
            "api_key_length": len(api_key),
            "api_key_preview": api_key[:8] + "..." if len(api_key) > 8 else api_key,
            "api_key_source": api_key_source,
            "env_gemini_key_set": bool(os.getenv("GEMINI_API_KEY")),
            "env_google_key_set": bool(os.getenv("GOOGLE_API_KEY")),
            "model": model_name,
            "payload_preview": json.dumps(payload, ensure_ascii=False)[:500] + "..." if len(json.dumps(payload)) > 500 else json.dumps(payload, ensure_ascii=False)
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=90)
            response.raise_for_status()
            result = response.json()
        except requests.HTTPError as exc:
            # 尝试获取详细错误信息
            error_detail = str(exc)
            status_code = exc.response.status_code if exc.response else "Unknown"
            response_text = ""

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
            except Exception:
                if response_text:
                    error_detail = f"{error_detail} | 响应: {response_text[:300]}"

            return self._error(
                f"Gemini 3 调用失败 [HTTP {status_code}]\n"
                f"错误详情: {error_detail}\n"
                f"\n调试信息:\n{json.dumps(debug_info, ensure_ascii=False, indent=2)}"
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gemini 3 调用失败：{exc}\n\n调试信息:\n{json.dumps(debug_info, ensure_ascii=False, indent=2)}")

        text = self._extract_gemini_text(result)
        if not text:
            return self._error("Gemini 3 返回为空或解析失败，请检查响应格式或稍后重试。")

        generated_at = datetime.now(timezone.utc).isoformat()
        preview_payload = {
            "token": f"text-{uuid4().hex[:8]}",
            "kind": "text",
            "available": True,
            "generated_at": generated_at,
            "text": text,
            "model": model_name,
            "prompt": prompt,
        }

        result_data: dict[str, Any] = {
            "text": text,
            "prompt": prompt,
            "model": model_name,
            "text_preview": preview_payload,
        }
        usage = result.get("usageMetadata")
        if usage:
            result_data["usage"] = usage

        self.status = "✅ Gemini 3 文本生成完成"
        return Data(data=result_data, text_key="text")

    def _build_gemini_parts(self, prompt_source: Any) -> list[dict[str, Any]]:
        """构建 Gemini API 的 parts，支持文本、图像和视频。"""
        parts: list[dict[str, Any]] = []

        def _add_from_value(value: Any) -> None:
            """从值中提取并添加内容到 parts"""
            if value is None:
                return

            # 处理 Data 对象
            if isinstance(value, Data):
                _add_from_value(value.data)
                return

            # 处理字典
            if isinstance(value, dict):
                # 优先处理文本内容
                text_value = value.get("text") or value.get("prompt") or value.get("content")
                if isinstance(text_value, str) and text_value.strip():
                    parts.append({"text": str(text_value).strip()})

                # 处理图像数据
                image_data = self._extract_image_from_dict(value)
                if image_data:
                    parts.append(image_data)

                # 处理视频数据
                video_data = self._extract_video_from_dict(value)
                if video_data:
                    parts.append(video_data)

                # 递归处理嵌套的列表
                for key in ["images", "generated_images", "videos", "reference_images"]:
                    nested = value.get(key)
                    if isinstance(nested, list):
                        for item in nested:
                            _add_from_value(item)

                # FileInput payloads typically store paths in `file_path` (list or string).
                file_paths = value.get("file_path") or value.get("path")
                if isinstance(file_paths, list):
                    for path in file_paths:
                        _add_from_value({"file_path": path})

                return

            # 处理列表
            if isinstance(value, (list, tuple)):
                for item in value:
                    _add_from_value(item)
                return

            # 处理字符串
            if isinstance(value, str) and value.strip():
                # 检查是否为 data URL
                if value.strip().startswith("data:"):
                    mime_type = value.strip().split(":")[1].split(";")[0] if ":" in value else "image/png"
                    if ";base64," in value:
                        _, encoded = value.strip().split(";base64,", 1)
                        if mime_type.startswith("image/"):
                            parts.append({"inline_data": {"mime_type": mime_type, "data": encoded.strip()}})
                        elif mime_type.startswith("video/"):
                            parts.append({"inline_data": {"mime_type": mime_type, "data": encoded.strip()}})
                else:
                    parts.append({"text": value.strip()})

        _add_from_value(prompt_source)
        return parts if parts else [{"text": ""}]

    @staticmethod
    def _extract_image_from_dict(data: dict[str, Any]) -> dict[str, Any] | None:
        """从字典中提取图像数据"""
        # 常见的图像数据字段
        image_keys = ["image_data_url", "data_url", "preview_base64", "image_base64", "image", "cover_preview_base64"]

        for key in image_keys:
            value = data.get(key)
            if not isinstance(value, str) or not value.strip():
                continue

            value = value.strip()

            # 已经是 data URL 格式
            if value.startswith("data:image"):
                try:
                    mime_type = value.split(":")[1].split(";")[0]
                    _, encoded = value.split(";base64,", 1)
                    return {"inline_data": {"mime_type": mime_type, "data": encoded.strip()}}
                except Exception:
                    continue

            # 可能是纯 base64
            if ";" not in value and "," not in value:
                try:
                    import base64
                    # 尝试解码验证是否为有效的 base64
                    base64.b64decode(value)
                    return {"inline_data": {"mime_type": "image/png", "data": value.strip()}}
                except Exception:
                    continue

        file_path_value = data.get("file_path") or data.get("path")
        if isinstance(file_path_value, str) and file_path_value.strip():
            try:
                file_path = Path(file_path_value)
                if file_path.exists() and file_path.is_file():
                    # Keep the same per-image size guard as other media components.
                    if file_path.stat().st_size > 10 * 1024 * 1024:
                        return None
                    mime_type, _ = mimetypes.guess_type(file_path.name)
                    mime_type = mime_type or "image/png"
                    encoded = base64.b64encode(file_path.read_bytes()).decode("utf-8")
                    return {"inline_data": {"mime_type": mime_type, "data": encoded}}
            except Exception:
                return None

        return None

    @staticmethod
    def _extract_video_from_dict(data: dict[str, Any]) -> dict[str, Any] | None:
        """从字典中提取视频数据"""
        MAX_VIDEO_INLINE_BYTES = 25 * 1024 * 1024

        def _is_video_like(url: str) -> bool:
            url = (url or "").strip().lower()
            if not url:
                return False
            path = url.split("?", 1)[0].split("#", 1)[0]
            return path.endswith((".mp4", ".mov", ".webm", ".mkv", ".avi"))

        def _download_video_as_inline_data(url: str) -> dict[str, Any] | None:
            url = (url or "").strip()
            if not url:
                return None
            try:
                import requests
            except Exception:
                return None

            try:
                with requests.get(url, stream=True, timeout=45) as resp:
                    resp.raise_for_status()
                    ctype = (resp.headers.get("content-type") or "").split(";", 1)[0].strip()
                    if not ctype:
                        guessed, _ = mimetypes.guess_type(url)
                        ctype = guessed or ""
                    if ctype and not ctype.startswith("video/") and not _is_video_like(url):
                        return None

                    buf = bytearray()
                    for chunk in resp.iter_content(chunk_size=1024 * 128):
                        if not chunk:
                            continue
                        buf.extend(chunk)
                        if len(buf) > MAX_VIDEO_INLINE_BYTES:
                            return None

                encoded = base64.b64encode(bytes(buf)).decode("utf-8")
                return {"inline_data": {"mime_type": ctype or "video/mp4", "data": encoded}}
            except Exception:
                return None

        # Support nested Doubao preview payloads.
        preview = data.get("doubao_preview")
        if isinstance(preview, dict):
            payload = preview.get("payload")
            if isinstance(payload, dict):
                nested = TextCreation._extract_video_from_dict(payload)
                if nested:
                    return nested

        # Common video fields (inline or URL).
        video_keys = ["video_data_url", "video_base64", "video", "video_url", "url"]
        for key in video_keys:
            value = data.get(key)
            if not isinstance(value, str) or not value.strip():
                continue
            value = value.strip()

            # data URL format
            if value.startswith("data:video") and ";base64," in value:
                try:
                    mime_type = value.split(":", 1)[1].split(";", 1)[0]
                    _, encoded = value.split(";base64,", 1)
                    return {"inline_data": {"mime_type": mime_type, "data": encoded.strip()}}
                except Exception:
                    continue

            # raw base64 (assume mp4)
            if key == "video_base64" and ";" not in value and "," not in value:
                try:
                    base64.b64decode(value)
                    return {"inline_data": {"mime_type": "video/mp4", "data": value.strip()}}
                except Exception:
                    pass

            # URL -> inline_data
            if value.startswith(("http://", "https://")):
                downloaded = _download_video_as_inline_data(value)
                if downloaded:
                    return downloaded

        # Local file path -> inline_data (best-effort)
        file_path_value = data.get("file_path") or data.get("path")
        if isinstance(file_path_value, str) and file_path_value.strip():
            try:
                file_path = Path(file_path_value)
                if file_path.exists() and file_path.is_file():
                    if file_path.stat().st_size > MAX_VIDEO_INLINE_BYTES:
                        return None
                    mime_type, _ = mimetypes.guess_type(file_path.name)
                    if mime_type and mime_type.startswith("video/"):
                        encoded = base64.b64encode(file_path.read_bytes()).decode("utf-8")
                        return {"inline_data": {"mime_type": mime_type, "data": encoded}}
            except Exception:
                return None

        return None

    @staticmethod
    def _extract_gemini_text(result: dict[str, Any]) -> str:
        candidates = result.get("candidates") or []
        if not candidates:
            return ""
        content = (candidates[0] or {}).get("content") or {}
        parts = content.get("parts") or []
        texts: list[str] = []
        for part in parts:
            if not isinstance(part, dict):
                continue
            value = part.get("text")
            if value:
                texts.append(str(value))
        return "".join(texts).strip()

    @staticmethod
    def _is_gemini3(model_name: str) -> bool:
        return model_name.strip().startswith(GEMINI3_MODEL_PREFIXES)

    @staticmethod
    def _looks_like_inline_media(value: str) -> bool:
        text = value.strip()
        if not text:
            return False
        if text.startswith("data:image") or text.startswith("data:video"):
            return True
        # Heuristic for raw base64: avoid treating normal prompts as "media".
        if len(text) < 256:
            return False
        try:
            import re

            if re.fullmatch(r"[A-Za-z0-9+/=]+", text) and len(text) % 4 == 0:
                return True
        except Exception:
            return False
        return False

    @staticmethod
    def _merge_prompt(prompt_source: Any | None) -> str:
        """合并多种提示词输入格式。"""
        if prompt_source is None:
            return ""
        if isinstance(prompt_source, list):
            return "\n".join(str(item) for item in prompt_source if item)
        if isinstance(prompt_source, dict):
            return "\n".join(f"{k}: {v}" for k, v in prompt_source.items() if v)
        return str(prompt_source).strip()

    @staticmethod
    def _has_media(value: Any | None) -> bool:
        """Best-effort check for multimodal inputs (uploaded files or inline image data)."""
        if value is None:
            return False
        if isinstance(value, Data):
            return TextCreation._has_media(value.data)
        if isinstance(value, dict):
            # Common nested preview payload shape: {"doubao_preview": {"payload": {...}}}
            preview = value.get("doubao_preview")
            if isinstance(preview, dict) and TextCreation._has_media(preview.get("payload")):
                return True

            file_paths = value.get("file_path") or value.get("path")
            if isinstance(file_paths, str) and file_paths.strip():
                return True
            if isinstance(file_paths, list) and any(
                isinstance(item, str) and item.strip() for item in file_paths
            ):
                return True
            value_list = value.get("value")
            if isinstance(value_list, list) and any(TextCreation._has_media(item) for item in value_list):
                return True
            for key in (
                "images",
                "generated_images",
                "videos",
                "reference_images",
                "image_data_url",
                "data_url",
                "preview_base64",
                "image_base64",
                "image",
                "cover_preview_base64",
                "video_data_url",
                "video_base64",
                "video_url",
                "video",
                "doubao_preview",
                "payload",
            ):
                if TextCreation._has_media(value.get(key)):
                    return True
            return False
        if isinstance(value, (list, tuple)):
            return any(TextCreation._has_media(item) for item in value)
        if isinstance(value, str):
            return TextCreation._looks_like_inline_media(value)
        return True

    @staticmethod
    def _error(message: str) -> Data:
        return Data(data={"error": message}, type="error")

    def _resolve_deepseek_api_key(self) -> str:
        """Resolve DeepSeek API key from node input, provider credentials, or env."""
        candidates: list[str | None] = [self.api_key]

        try:  # pragma: no cover - runtime dependency
            from langflow.services.deps import get_settings_service

            settings_service = get_settings_service()
            config_dir = settings_service.settings.config_dir
            deepseek_creds = get_provider_credentials("deepseek", config_dir)
            default_creds = get_provider_credentials(DEFAULT_PROVIDER_KEY, config_dir)
            candidates.extend([deepseek_creds.api_key, default_creds.api_key])
        except Exception:
            pass

        candidates.append(os.getenv("DEEPSEEK_API_KEY", ""))

        for key in candidates:
            if key and key.strip():
                return key.strip()
        return ""

    def _resolve_gemini_api_key(self) -> str:
        """Resolve Gemini API key from providers first, then env.

        Priority: Provider(gemini) -> Provider(google) -> ENV(GEMINI_API_KEY) -> ENV(GOOGLE_API_KEY)
        Note: Does NOT read default provider to avoid picking up stale test values.
        """
        candidates: list[str] = []

        # 调试:记录所有来源
        sources = []

        # 1. 优先从 Provider Credentials 读取 (gemini -> google，不读取 default)
        try:  # pragma: no cover - runtime dependency
            from langflow.services.deps import get_settings_service

            settings_service = get_settings_service()
            config_dir = settings_service.settings.config_dir

            gemini_creds = get_provider_credentials("gemini", config_dir)
            google_creds = get_provider_credentials("google", config_dir)

            if gemini_creds and gemini_creds.api_key:
                candidates.append(gemini_creds.api_key)
                sources.append(f"Provider(Gemini): {gemini_creds.api_key[:8]}... (len={len(gemini_creds.api_key)})")
            if google_creds and google_creds.api_key:
                candidates.append(google_creds.api_key)
                sources.append(f"Provider(Google): {google_creds.api_key[:8]}... (len={len(google_creds.api_key)})")
        except Exception as e:
            sources.append(f"Provider Error: {str(e)[:50]}")

        # 2. 其次从环境变量读取
        gemini_env = os.getenv("GEMINI_API_KEY", "")
        google_env = os.getenv("GOOGLE_API_KEY", "")

        if gemini_env:
            candidates.append(gemini_env)
            sources.append(f"ENV(GEMINI_API_KEY): {gemini_env[:8]}... (len={len(gemini_env)})")
        if google_env:
            candidates.append(google_env)
            sources.append(f"ENV(GOOGLE_API_KEY): {google_env[:8]}... (len={len(google_env)})")

        # 记录调试信息
        import sys
        print(f"[DEBUG] _resolve_gemini_api_key sources:", file=sys.stderr)
        for s in sources:
            print(f"  - {s}", file=sys.stderr)

        for key in candidates:
            if key and key.strip():
                result = key.strip()
                print(f"[DEBUG] Selected API key: {result[:8]}... (len={len(result)})", file=sys.stderr)
                return result

        print("[DEBUG] No valid API key found!", file=sys.stderr)
        return ""
