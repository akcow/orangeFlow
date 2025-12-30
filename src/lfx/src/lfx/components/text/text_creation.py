from __future__ import annotations

import os
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
            required=True,
            value="",
            placeholder="描述你想要生成的内容，按需使用换行。",
            info="支持中文/英文，可与上游 Message/Data/Text 联动。",
            input_types=["Message", "Data", "Text"],
        ),
        DropdownInput(
            name="model_name",
            display_name="模型选择",
            options=["deepseek-chat", "deepseek-reasoner"],
            value="deepseek-chat",
            info="DeepSeek 模型选择，默认 deepseek-chat。",
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
            display_name="DeepSeek API Key",
            value=os.getenv("DEEPSEEK_API_KEY", ""),
            placeholder="留空时读取 DEEPSEEK_API_KEY 环境变量",
            info="DeepSeek 平台申请的 API Key。",
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

        # Passthrough mode: allow using the preview/draft text without calling the model.
        # This enables downstream nodes (e.g., video generation) to consume the text even when
        # the prompt input is intentionally left empty.
        if not prompt:
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

        api_key = self._resolve_api_key()
        if not api_key:
            return self._error(
                "未检测到 DeepSeek API Key，请在节点或 .env 中配置 DEEPSEEK_API_KEY，"
                "或在 密钥配置 - DeepSeek 中输入。"
            )

        model_name = self.model_name or "deepseek-chat"
        api_base = (self.api_base or "https://api.deepseek.com/v1").rstrip("/")

        try:
            from langchain_openai import ChatOpenAI
        except ImportError:
            return self._error("缺少 langchain-openai 依赖，请安装后重试。")

        try:
            llm = ChatOpenAI(
                model=model_name,
                base_url=api_base,
                api_key=api_key,
                temperature=0.7,
                streaming=False,
            )
            response = llm.invoke([HumanMessage(content=prompt)])
            content = getattr(response, "content", None) or str(response)
            usage = getattr(response, "usage_metadata", None)
        except Exception as exc:  # noqa: BLE001
            return self._error(f"DeepSeek 调用失败：{exc}")

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
            "api_base": api_base,
            "text_preview": preview_payload,
        }
        if usage:
            result_data["usage"] = usage

        self.status = "✅ DeepSeek 文本生成完成"
        return Data(data=result_data, text_key="text")

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
    def _error(message: str) -> Data:
        return Data(data={"error": message}, type="error")

    def _resolve_api_key(self) -> str:
        """Resolve API key from node input, provider credentials, or env."""
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
