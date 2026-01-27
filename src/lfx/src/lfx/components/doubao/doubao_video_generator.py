"""视频创作 LFX 组件 - 适配版"""

from __future__ import annotations

import base64
import mimetypes
import os
import time

import requests
from pathlib import Path
from typing import Any
from datetime import datetime, timezone
from urllib.parse import urlencode

from dotenv import load_dotenv

# NOTE: This component now routes through the hosted gateway; no direct Ark SDK usage.

# LFX系统导入
from lfx.custom.custom_component.component import Component
from lfx.schema.data import Data
from lfx.components.doubao.shared_credentials import resolve_credentials
from lfx.inputs.inputs import (
    DataInput,
    DropdownInput,
    FileInput,
    FloatInput,
    IntInput,
    MultilineInput,
    SecretStrInput,
    StrInput,
)
from lfx.template.field.base import Output
from lfx.utils.public_files import generate_public_file_token

load_dotenv()


class DoubaoVideoGenerator(Component):
    """调用豆包视频创作接口的 LFX 组件，支持异步生成和状态轮询。"""

    display_name = "视频创作"
    description = ""
    icon = "DoubaoVideoGenerator"
    name = "DoubaoVideoGenerator"

    # 模型配置映射：UI显示名称 -> API端点ID/分支
    MODEL_MAPPING = {
        "Doubao-Seedance-1.5-pro｜251215": "doubao-seedance-1-5-pro-251215",
        "Doubao-Seedance-1.0-pro｜250528": "doubao-seedance-1-0-pro-250528",
        "Doubao-Seedance-1.0-pro-fast｜251015": "doubao-seedance-1-0-pro-fast-251015",
        "wan2.6": "wan2.6",
        "wan2.5": "wan2.5",
        "VEO3.1": "veo-3.1-generate-preview",
        "veo3.1-fast": "veo-3.1-fast-generate-preview",
        "sora-2": "sora-2",
        "sora-2-pro": "sora-2-pro",
        "kling O1": "kling-video-o1",
    }

    MODEL_LIMITS = {
        "Doubao-Seedance-1.5-pro｜251215": {
            "resolutions": ["480p", "720p", "1080p"],
            "min_duration": 4,
            "max_duration": 12,
            "supports_last_frame": True,
        },
        "Doubao-Seedance-1.0-pro｜250528": {
            "resolutions": ["480p", "720p", "1080p"],
            "min_duration": 2,
            "max_duration": 12,
            "supports_last_frame": True,
        },
        "Doubao-Seedance-1.0-pro-fast｜251015": {
            "resolutions": ["480p", "720p"],
            "min_duration": 2,
            "max_duration": 12,
            "supports_last_frame": False,
        },
        "wan2.6": {
            "resolutions": ["720p", "1080p"],
            "min_duration": 5,
            "max_duration": 15,
            "supports_last_frame": False,
        },
        "wan2.5": {
            "resolutions": ["480p", "720p", "1080p"],
            "min_duration": 5,
            "max_duration": 10,
            "supports_last_frame": False,
        },
        "VEO3.1": {
            "resolutions": ["720p", "1080p"],
            "min_duration": 4,
            "max_duration": 8,
            "supports_last_frame": True,
            "supports_reference_images": True,  # 标准版支持参考图片
        },
        "veo3.1-fast": {
            "resolutions": ["720p", "1080p"],
            "min_duration": 4,
            "max_duration": 8,
            "supports_last_frame": True,
            "supports_reference_images": False,  # 快速版不支持参考图片
        },
        # Sora 模型配置（逆向渠道）
        "sora-2": {
            "resolutions": ["720p", "1080p"],
            "min_duration": 10,
            "max_duration": 15,
            "supports_last_frame": False,
            "supports_reference_images": True,
            "available_durations": [10, 15],
            "available_sizes": ["720x1280", "1280x720", "1024x1792", "1792x1024"],
            "channel_type": "reverse",  # 逆向渠道
        },
        "sora-2-pro": {
            "resolutions": ["720p", "1080p"],
            "min_duration": 10,
            "max_duration": 25,
            "supports_last_frame": False,
            "supports_reference_images": True,
            "available_durations": [10, 15, 25],
            "available_sizes": ["720x1280", "1280x720", "1024x1792", "1792x1024"],
            "channel_type": "reverse",  # 逆向渠道
        },
        "kling O1": {
            "resolutions": ["720p", "1080p"],
            "min_duration": 3,
            "max_duration": 10,
            "supports_last_frame": True,
            "supports_reference_images": True,
            "supports_reference_videos": True,
            "supported_ratios": ["16:9", "9:16", "1:1"],
        },
    }

    SUPPORTED_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"]
    VEO_SUPPORTED_RATIOS = ["16:9", "9:16"]
    VEO_SUPPORTED_DURATIONS = [4, 6, 8]
    VEO_SUPPORTED_RESOLUTIONS = ["720p", "1080p"]
    DEFAULT_VIDEO_INLINE_MAX_BYTES = 30 * 1024 * 1024
    KLING_SUPPORTED_RATIOS = ["16:9", "9:16", "1:1"]

    DASHSCOPE_API_BASE = "https://dashscope.aliyuncs.com"
    DASHSCOPE_POLL_INTERVAL_SECONDS = 2.0

    # Sora API 配置
    SORA_API_BASE = "https://cdn.12ai.org"
    SORA_POLL_INTERVAL_SECONDS = 3.0
    SORA_DEFAULT_TIMEOUT = 600

    inputs = [
        DropdownInput(
            name="model_name",
            display_name="模型名称",
            options=list(MODEL_MAPPING.keys()),
            value="Doubao-Seedance-1.0-pro-fast｜251015",  # 使用UI显示的模型名称作为默认值
            required=True,
            real_time_refresh=True,
            info="选择视频创作模型，UI显示模型名称，API调用使用对应的端点ID。",
        ),
        MultilineInput(
            name="prompt",
            display_name="视频生成提示词",
            required=False,
            value="",
            placeholder="示例：无人机以极快速度穿越复杂障碍或自然奇观，带来沉浸式飞行体验",
            info="描述要生成的视频内容，支持详细的场景和动作描述。",
            input_types=["Message", "Data", "Text"],
        ),
        DataInput(
            name="audio_input",
            display_name="音频输入",
            show=True,
            required=False,
            value={},
            input_types=["Data"],
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
            display_name="视频分辨率",
            options=["480p", "720p", "1080p"],
            value="1080p",
            required=False,
            info="生成视频的分辨率。Veo: 1080p 仅支持 8 秒；当选择 4/6 秒时会自动使用 720p。",
        ),
        IntInput(
            name="duration",
            display_name="视频时长",
            required=False,
            value=5,
            info="生成视频的时长（秒）。Doubao: 2-12s；wan2.6: 5/10/15；wan2.5: 5/10；Veo: 4/6/8（1080p 仅支持 8 秒，4/6 秒会自动使用 720p）；Sora-2: 10/15；Sora-2-pro: 10/15/25。",
        ),
        DropdownInput(
            name="aspect_ratio",
            display_name="视频宽高比",
            options=SUPPORTED_RATIOS,
            value="16:9",
            required=False,
            info="设置视频的宽高比。Doubao/wan/Veo: 支持常见比例及adaptive；Sora: 自动转换为对应尺寸（16:9→1280x720, 9:16→720x1280）。",
        ),
        FileInput(
            name="first_frame_image",
            display_name="首帧图输入",
            is_list=True,
            list_add_label="继续添加候选图",
            file_types=["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "mp4", "mov"],
            input_types=["Data"],
            info="可选：上传图片或视频，或连接上游图片节点。\n- Doubao/wan: 首帧图片\n- Veo: 首帧/尾帧/参考图（根据role字段）\n- Sora: 参考图片（input_reference）",
        ),
        FileInput(
            name="last_frame_image",
            display_name="尾帧图输入",
            is_list=False,
            list_add_label="设置尾帧",
            file_types=["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff"],
            input_types=["Data"],
            info="可选：上传或指定尾帧图片，实现首尾帧衔接的视频生成。",
        ),
        SecretStrInput(
            name="api_key",
            display_name="豆包 API 密钥",
            required=False,
            value="",
            placeholder="如留空将读取 .env 中的 ARK_API_KEY",
            info="可选：覆盖模型所需的 API Key。\n- Doubao/Ark 模型：使用 ARK_API_KEY\n- wan/DashScope 模型：使用 DASHSCOPE_API_KEY\n- Sora 模型：使用 OPENAI_API_KEY（Settings-Provider Credentials-OpenAI）\n- Veo 模型：使用 GEMINI_API_KEY/GOOGLE_API_KEY",
            load_from_db=False,
        ),
        StrInput(
            name="sora_api_base",
            display_name="Sora API Base",
            value="https://cdn.12ai.org",
            advanced=True,
            info="Sora API 基础地址，默认 https://cdn.12ai.org",
        ),
        IntInput(
            name="sora_timeout_seconds",
            display_name="Sora 超时时间",
            value=600,
            advanced=True,
            info="Sora API 请求超时时间（秒）",
        ),
        DropdownInput(
            name="sora_group",
            display_name="Sora 分组",
            options=["auto", "reverse", "official"],
            value="auto",
            advanced=True,
            required=False,
            info="可选：用于国内代理侧的渠道分组选择。auto 为默认；sora-2/sora-2-pro 常见为 reverse。",
        ),
        StrInput(
            name="sora_distributor",
            display_name="Sora Distributor",
            value="",
            advanced=True,
            required=False,
            info="可选：指定国内代理侧的 distributor（渠道）。留空则由服务端自动选择。",
        ),
        DropdownInput(
            name="kling_mode",
            display_name="Kling 模式",
            options=["std", "pro"],
            value="pro",
            advanced=True,
            required=False,
            info="仅 kling O1：生成视频的模式（std=标准，pro=高品质）。",
        ),
        DropdownInput(
            name="kling_video_refer_type",
            display_name="Kling 参考视频类型",
            options=["feature", "base"],
            value="feature",
            advanced=True,
            required=False,
            real_time_refresh=True,
            info="仅 kling O1：feature=特征参考视频；base=待编辑视频（视频编辑）。",
        ),
        DropdownInput(
            name="kling_keep_original_sound",
            display_name="Kling 保留原声",
            options=["yes", "no"],
            value="yes",
            advanced=True,
            required=False,
            info="仅 kling O1：参考视频/编辑视频是否保留视频原声。",
        ),
        StrInput(
            name="kling_element_ids",
            display_name="Kling 主体ID列表",
            value="",
            advanced=True,
            required=False,
            info="仅 kling O1：主体库 element_id 列表（逗号分隔），用于 element_list，并可在 prompt 中用 <<<element_1>>> 引用。",
        ),
        StrInput(
            name="kling_callback_url",
            display_name="Kling Callback URL",
            value="",
            advanced=True,
            required=False,
            info="仅 kling O1：任务状态回调地址（可选）。",
        ),
        StrInput(
            name="kling_external_task_id",
            display_name="Kling External Task ID",
            value="",
            advanced=True,
            required=False,
            info="仅 kling O1：自定义任务 ID（可选，单用户需唯一）。",
        ),
    ]

    outputs = [
        Output(
            name="video",
            display_name="视频结果",
            method="build_video",
            types=["Data"],
        )
    ]

    def build_video(self) -> Data:
        merged_prompt = self._merge_prompt(self.prompt)
        if not merged_prompt:
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
                    "kind": "video",
                    "available": False,
                    "generated_at": generated_at,
                    "payload": payload,
                },
            }
            self.status = "🔁 桥梁模式：提示词为空，直通预览输出"
            return Data(data=payload, type="video")

        model_name = str(self.model_name or "").strip()
        endpoint_id = self.MODEL_MAPPING.get(model_name, model_name)

        # All provider calls go through the hosted gateway (server-managed credentials).
        if model_name.startswith("wan2."):
            return self._build_video_wan_gateway(prompt=merged_prompt, model_name=model_name)
        if self._is_veo_model(model_name):
            return self._build_video_veo_gateway(prompt=merged_prompt, endpoint_id=endpoint_id)
        if self._is_sora_model(model_name):
            return self._build_video_sora_gateway(prompt=merged_prompt, endpoint_id=endpoint_id)
        if self._is_kling_model(model_name):
            return self._build_video_kling_gateway(prompt=merged_prompt, endpoint_id=endpoint_id)

        return self._build_video_gateway(prompt=merged_prompt, endpoint_id=endpoint_id, model_display_name=model_name)

    def update_build_config(self, build_config, field_value: Any, field_name: str | None = None):
        """Dynamically adjust UI controls based on the selected model.

        For kling O1, we must:
        - limit aspect ratio to 16:9 / 9:16 / 1:1
        - clamp duration to 3-10 seconds (with doc caveats shown in tooltip)
        - hide unsupported fields like resolution
        """
        # Keep default behavior (update the current field value).
        if field_name and field_name in build_config:
            build_config[field_name]["value"] = field_value

        try:
            model_value = str((build_config.get("model_name") or {}).get("value") or "").strip()
        except Exception:
            model_value = ""

        is_kling = model_value.lower().startswith("kling")
        refer_type = str((build_config.get("kling_video_refer_type") or {}).get("value") or "feature").strip().lower()

        # Helper to restore a field back to its static definition (keeps current value).
        def _restore_field_defaults(field: str) -> None:
            current_value = (build_config.get(field) or {}).get("value")
            for inp in getattr(type(self), "inputs", []) or []:
                if getattr(inp, "name", None) == field and hasattr(inp, "to_dict"):
                    build_config[field] = inp.to_dict()
                    if current_value is not None:
                        build_config[field]["value"] = current_value
                    return

        if is_kling:
            # Resolution is not a Kling parameter.
            if "resolution" in build_config:
                build_config["resolution"]["show"] = False

            # Aspect ratio: only 16:9 / 9:16 / 1:1.
            if "aspect_ratio" in build_config:
                # Video editing mode outputs with the input video's aspect; this knob is irrelevant.
                build_config["aspect_ratio"]["show"] = refer_type != "base"
                build_config["aspect_ratio"]["options"] = list(self.KLING_SUPPORTED_RATIOS)
                # Clear metadata to avoid stale icons/labels.
                build_config["aspect_ratio"]["options_metadata"] = []
                ratio_value = str(build_config["aspect_ratio"].get("value") or "16:9").strip()
                if ratio_value not in self.KLING_SUPPORTED_RATIOS:
                    build_config["aspect_ratio"]["value"] = "16:9"
                build_config["aspect_ratio"]["info"] = (
                    "kling O1：仅支持 16:9 / 9:16 / 1:1。未使用首帧参考或视频编辑功能时必填。"
                )

            # Duration: 3-10 seconds (with doc constraints for some modes).
            if "duration" in build_config:
                # If user selected video editing (base), duration is ignored by upstream.
                build_config["duration"]["show"] = refer_type != "base"
                # Frontend expects `range_spec` (snake_case).
                build_config["duration"]["range_spec"] = {"min": 3, "max": 10, "step": 1, "step_type": "int"}
                try:
                    dur = int(build_config["duration"].get("value") or 5)
                except Exception:
                    dur = 5
                if dur < 3:
                    dur = 3
                if dur > 10:
                    dur = 10
                build_config["duration"]["value"] = dur
                build_config["duration"]["info"] = (
                    "kling O1：时长仅支持 3-10 秒。"
                    "文生视频/首帧图生视频仅支持 5 或 10 秒；"
                    "视频编辑（refer_type=base）时输出与输入视频时长一致，此参数无效。"
                )

        else:
            # Restore defaults when switching away from Kling.
            if "resolution" in build_config:
                build_config["resolution"]["show"] = True
            _restore_field_defaults("aspect_ratio")
            _restore_field_defaults("duration")

        return build_config

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
            # Keys should not contain whitespace; if a masked secret like "****1234" was saved, keep as-is for diagnosis.
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

        # 初始化Ark客户端
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

        client = Ark(**client_kwargs)

        # 准备API参数
        try:
            model_name = str(self.model_name or "")
            model_limits = self.MODEL_LIMITS.get(model_name, {})
            resolution = str(self.resolution or "1080p")
            duration = int(self.duration or 5)
            aspect_ratio = str(self.aspect_ratio or "16:9")
            allowed_resolutions = model_limits.get("resolutions") or []
            if allowed_resolutions and resolution not in allowed_resolutions:
                resolution = allowed_resolutions[0]
            if aspect_ratio not in self.SUPPORTED_RATIOS:
                aspect_ratio = self.SUPPORTED_RATIOS[0]
            min_duration = model_limits.get("min_duration", 2)
            max_duration = model_limits.get("max_duration", 12)
            duration = max(min_duration, min(duration, max_duration))
            supports_last_frame = model_limits.get("supports_last_frame", True)
            camera_fixed = False
            watermark = False
            enable_preview = True
            # 使用固定的轮询参数（不在UI中显示）
            polling_interval = 3  # 固定3秒轮询间隔
            max_wait_time = 300   # 固定5分钟最大等待时间

            # 获取API调用所需的端点ID
            endpoint_id = self.MODEL_MAPPING.get(self.model_name, self.model_name)
        except (TypeError, ValueError):
            return self._error("参数格式错误，请检查输入的数值。")

        # 构建文本提示词参数
        text_params = f"{merged_prompt} --ratio {aspect_ratio} --dur {duration} --resolution {resolution} --camerafixed {str(camera_fixed).lower()} --watermark {str(watermark).lower()}"

        # 构建内容数组
        content = [
            {
                "type": "text",
                "text": text_params
            }
        ]

        # 如果提供了首帧图片，添加到内容中
        first_frame_url = self._extract_image_url(getattr(self, "first_frame_image", None))
        if first_frame_url:
            self.status = f"🖼️ 使用首帧图片: {first_frame_url[:50]}..."
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": first_frame_url
                },
                "role": "first_frame"
            })
        else:
            self.status = "📝 未提供首帧图片，进行纯文生视频"

        last_frame_url = None
        if supports_last_frame:
            last_frame_url = self._extract_image_url(getattr(self, "last_frame_image", None))
            if last_frame_url:
                self.status = f"🖼️ 使用尾帧图片: {last_frame_url[:50]}..."
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": last_frame_url
                    },
                    "role": "last_frame"
                })
        elif getattr(self, "last_frame_image", None):
            self.status = "ℹ️ 当前模型不支持尾帧，已忽略尾帧输入"

        # 构建生成参数
        # 注意：不同版本的 Ark SDK 对 tasks.create 的参数支持不一致。
        # 当前 SDK 不支持 resolution/ratio/duration 作为 kwargs（会抛 TypeError），因此将这些信息仅保留在 text prompt 中。
        generate_params: dict[str, Any] = {
            "model": endpoint_id,  # 使用端点ID进行API调用
            "content": content,
        }
        if supports_last_frame and (first_frame_url or last_frame_url):
            generate_params["return_last_frame"] = True

        try:
            # 创建视频生成任务
            self.status = "📋 创建视频生成任务..."
            try:
                create_result = client.content_generation.tasks.create(**generate_params)
            except TypeError as exc:
                # Backward/forward compat: retry without optional flags if the SDK signature changed.
                if "unexpected keyword argument" in str(exc) and "return_last_frame" in generate_params:
                    fallback_params = {k: v for k, v in generate_params.items() if k != "return_last_frame"}
                    create_result = client.content_generation.tasks.create(**fallback_params)
                else:
                    raise
            task_id = create_result.id

            self.status = f"⏳ 任务已创建 (ID: {task_id})，开始轮询状态..."

            # 轮询查询任务状态
            start_time = time.time()
            while True:
                get_result = client.content_generation.tasks.get(task_id=task_id)
                status = get_result.status

                if status == "succeeded":
                    self.status = "✅ 视频生成成功！"
                    break
                elif status == "failed":
                    error_msg = getattr(get_result, 'error', '未知错误')
                    return self._error(f"视频生成失败：{error_msg}")
                else:
                    # 检查是否超时
                    elapsed_time = time.time() - start_time
                    if elapsed_time > max_wait_time:
                        return self._error(f"视频生成超时（超过{max_wait_time}秒），请稍后重试。")

                    self.status = f"⏳ 当前状态: {status}，已等待 {int(elapsed_time)}s，{polling_interval}秒后重试..."
                    time.sleep(polling_interval)

            # 提取结果数据 - 增强调试信息和响应解析
            self.status = "🔍 解析API响应数据..."

            # 记录完整的响应信息用于调试
            # 记录完整的响应信息用于调试
            result_data = {
                "task_id": task_id,
                "status": "succeeded",
                "prompt": merged_prompt,
                "resolution": resolution,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                "camera_fixed": camera_fixed,
                "watermark": watermark,
                "model_display_name": self.model_name,  # UI显示的模型名称
                "model_endpoint_id": endpoint_id,  # API调用使用的端点ID
                "supports_last_frame": supports_last_frame,
                "generation_time": int(time.time() - start_time),
                "first_frame_used": bool(first_frame_url),
                "last_frame_used": bool(last_frame_url) if supports_last_frame else False,
                "debug_info": {
                    "has_results": hasattr(get_result, 'results'),
                    "has_data": hasattr(get_result, 'data'),
                    "has_content": hasattr(get_result, 'content'),
                    "response_type": type(get_result).__name__,
                    "response_attributes": [attr for attr in dir(get_result) if not attr.startswith('_')]
                }
            }

            # 提取额外的有用信息
            if hasattr(get_result, 'seed'):
                result_data["actual_seed"] = get_result.seed

            if hasattr(get_result, 'usage'):
                try:
                    usage = get_result.usage
                    if hasattr(usage, 'total_tokens'):
                        result_data["token_usage"] = {
                            "total_tokens": usage.total_tokens,
                            "completion_tokens": getattr(usage, 'completion_tokens', None)
                        }
                except Exception:
                    pass

            if hasattr(get_result, 'framespersecond'):
                result_data["fps"] = get_result.framespersecond

            # 尝试多种方式解析响应数据
            video_results = []

            # 方法1: 检查 content 属性（视频创作的主要方式）
            if hasattr(get_result, 'content') and get_result.content:
                try:
                    content_obj = get_result.content
                    video_url = None
                    cover_url = None
                    last_frame_resp = None

                    # 从content对象中提取URL
                    if hasattr(content_obj, 'video_url'):
                        video_url = content_obj.video_url
                    if hasattr(content_obj, 'cover_url'):
                        cover_url = content_obj.cover_url
                    if hasattr(content_obj, 'last_frame_url'):
                        cover_url = content_obj.last_frame_url
                        last_frame_resp = content_obj.last_frame_url
                        result_data["last_frame_url"] = content_obj.last_frame_url

                    if video_url:
                        video_results = [{
                            "index": 0,
                            "video_url": video_url,
                            "cover_url": cover_url,
                            "last_frame_url": last_frame_resp,
                            "duration": duration,
                            "source_attr": "content.video_url"
                        }]
                        result_data["debug_info"]["parsing_method"] = "content_attribute"
                except Exception as e:
                    result_data["debug_info"]["content_parse_error"] = str(e)

            # 方法2: 检查 results 属性
            elif hasattr(get_result, 'results') and get_result.results:
                video_results = self._parse_results_array(get_result.results)
                result_data["debug_info"]["parsing_method"] = "results_attribute"

            # 方法3: 检查 data 属性
            elif hasattr(get_result, 'data') and get_result.data:
                video_results = self._parse_results_array(get_result.data)
                result_data["debug_info"]["parsing_method"] = "data_attribute"

            # 方法4: 尝试直接访问可能的URL属性
            else:
                possible_url_attrs = ['url', 'video_url', 'video', 'result']
                for attr in possible_url_attrs:
                    if hasattr(get_result, attr):
                        url_value = getattr(get_result, attr)
                        if url_value:
                            video_results = [{
                                "index": 0,
                                "video_url": str(url_value),
                                "cover_url": None,
                                "duration": duration,
                                "source_attr": attr
                            }]
                            result_data["debug_info"]["parsing_method"] = f"direct_{attr}"
                            break

                # 如果还是没有找到，记录所有可用属性
                if not video_results:
                    all_attrs = {}
                    for attr in dir(get_result):
                        if not attr.startswith('_'):
                            try:
                                value = getattr(get_result, attr)
                                if not callable(value):
                                    all_attrs[attr] = str(value)[:200]  # 限制长度避免过长
                            except Exception:
                                all_attrs[attr] = "access_error"

                    result_data["debug_info"]["all_attributes"] = all_attrs
                    result_data["debug_info"]["raw_response"] = str(get_result)[:1000]  # 前1000字符

            result_data["videos"] = video_results
            result_data["video_count"] = len(video_results)

            # 添加可选的预览功能
            result_data["preview_enabled"] = enable_preview

            if enable_preview and video_results:
                self.status = "🖼️ 生成视频封面预览..."
                # 尝试为每个视频生成封面预览
                for i, video_data in enumerate(video_results):
                    cover_url = video_data.get("cover_url") or video_data.get("last_frame_url")
                    if cover_url:
                        preview_base64 = self._get_cover_preview(cover_url)
                        if preview_base64:
                            video_data["cover_preview_base64"] = preview_base64
                            video_data["cover_preview_type"] = "image/jpeg"
                        else:
                            video_data["cover_preview_error"] = "封面预览生成失败"

            if video_results and video_results[0].get("video_url"):
                self.status = f"✅ 视频生成成功 ({resolution}, {duration}秒) - 共{len(video_results)}个视频"
            else:
                self.status = f"⚠️ 任务完成但未获取到视频URL，请检查API响应格式"
                result_data["warning"] = "任务完成但未获取到视频URL"
                result_data["debug_suggestion"] = "API响应结构可能已变化，请查看debug_info字段了解详细响应内容"

            generated_at = datetime.now(timezone.utc).isoformat()
            primary_video: dict[str, Any] | None = video_results[0] if video_results else None
            primary_video_url = primary_video.get("video_url") if isinstance(primary_video, dict) else None
            primary_cover_url = None
            primary_cover_preview_base64 = None
            primary_duration = None
            if isinstance(primary_video, dict):
                primary_cover_url = primary_video.get("cover_url") or primary_video.get("last_frame_url")
                primary_cover_preview_base64 = primary_video.get("cover_preview_base64")
                primary_duration = primary_video.get("duration") or duration

            result_data["doubao_preview"] = {
                "token": task_id,
                "kind": "video",
                "available": bool(primary_video_url),
                "generated_at": generated_at,
                "payload": {
                    # Keep a flat payload shape for the frontend preview panel.
                    "video_url": primary_video_url,
                    "cover_url": primary_cover_url,
                    "cover_preview_base64": primary_cover_preview_base64,
                    "duration": primary_duration,
                    "videos": video_results,
                    "prompt": merged_prompt,
                    "task_id": task_id,
                },
                "error": result_data.get("warning"),
            }

        except Exception as exc:
            return self._error(f"视频生成失败：{exc}")

        return Data(data=result_data, type="video")

    def _parse_results_array(self, results_array: Any) -> list[dict[str, Any]]:
        """解析结果数组，提取视频信息"""
        video_results = []

        try:
            if isinstance(results_array, list):
                for i, result in enumerate(results_array):
                    video_data = {
                        "index": i,
                        "video_url": None,
                        "cover_url": None,
                        "last_frame_url": None,
                        "duration": None,
                    }

                    # 尝试提取URL信息
                    if hasattr(result, 'url'):
                        video_data["video_url"] = result.url
                    elif hasattr(result, 'video_url'):
                        video_data["video_url"] = result.video_url

                    # 尝试提取封面信息
                    if hasattr(result, 'cover_url'):
                        video_data["cover_url"] = result.cover_url
                    if hasattr(result, 'last_frame_url'):
                        video_data["last_frame_url"] = result.last_frame_url

                    # 尝试提取时长信息
                    if hasattr(result, 'duration'):
                        video_data["duration"] = result.duration

                    # 如果是字典类型
                    elif isinstance(result, dict):
                        video_data["video_url"] = result.get('url') or result.get('video_url')
                        video_data["cover_url"] = result.get('cover_url')
                        video_data["last_frame_url"] = result.get('last_frame_url')
                        video_data["duration"] = result.get('duration')

                    # 如果获取到了视频URL，添加到结果中
                    if video_data["video_url"]:
                        video_results.append(video_data)

        except Exception as e:
            # 解析失败时返回空列表，但记录错误
            print(f"解析结果数组时出错: {e}")

        return video_results

    def _build_video_dashscope(self, *, prompt: str, model_name: str) -> Data:
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
        if api_key and not api_key.startswith("****"):
            api_key = "".join(api_key.split())
        if api_key.startswith("****"):
            return self._error(
                "检测到 Provider Credentials 中保存了被掩码的 api_key（形如 ****1234），这不是有效的 DashScope key。"
                "请在 Provider Credentials 中重新粘贴完整 DASHSCOPE_API_KEY 保存。"
            )
        if not api_key:
            return self._error("未检测到 DASHSCOPE_API_KEY，请在 .env 或 Provider Credentials 中配置。")

        # Keep the WAN UI minimal: use fixed defaults for optional parameters.
        watermark = False
        prompt_extend = True
        resolution = str(getattr(self, "resolution", "1080p") or "1080p").strip()
        duration = int(getattr(self, "duration", 5) or 5)
        aspect_ratio = str(getattr(self, "aspect_ratio", "16:9") or "16:9").strip()

        media = self._collect_wan_media_from_first_frame()
        reference_urls = media["videos"]
        has_reference = bool(reference_urls)
        img_url = media["images"][0] if media["images"] else None
        has_img = bool(img_url)

        if has_reference and model_name != "wan2.6":
            return self._error("wan2.5 不支持参考生视频（r2v）。请切换到 wan2.6 或移除参考视频。")

        if has_reference:
            mode = "r2v"
            dashscope_model = "wan2.6-r2v"
        elif has_img:
            mode = "i2v"
            dashscope_model = "wan2.6-i2v" if model_name == "wan2.6" else "wan2.5-i2v-preview"
        else:
            mode = "t2v"
            dashscope_model = "wan2.6-t2v" if model_name == "wan2.6" else "wan2.5-t2v-preview"

        duration = self._enforce_wan_duration(model=dashscope_model, duration=duration)

        request_input: dict[str, Any] = {"prompt": prompt}
        parameters: dict[str, Any] = {"duration": duration, "watermark": watermark}
        if prompt_extend:
            parameters["prompt_extend"] = True

        if mode in ("t2v", "r2v"):
            try:
                parameters["size"] = self._map_wan_size(resolution=resolution, aspect_ratio=aspect_ratio)
            except ValueError as exc:
                return self._error(str(exc))
        else:
            try:
                parameters["resolution"] = self._map_wan_resolution(resolution=resolution, model=dashscope_model)
            except ValueError as exc:
                return self._error(str(exc))

        # If an upstream audio synthesis node is connected but fails, keep auto voice and surface the reason.
        self._wan_audio_input_error = None  # type: ignore[attr-defined]
        resolved_audio_url: str | None = None
        if mode == "i2v":
            request_input["img_url"] = img_url
            resolved_audio_url = self._resolve_wan_audio_url(api_key=api_key, model=dashscope_model)
            if resolved_audio_url:
                request_input["audio_url"] = resolved_audio_url
        elif mode == "t2v":
            resolved_audio_url = self._resolve_wan_audio_url(api_key=api_key, model=dashscope_model)
            if resolved_audio_url:
                request_input["audio_url"] = resolved_audio_url
        else:
            request_input["reference_video_urls"] = reference_urls[:3]
            resolved_audio_url = self._resolve_wan_audio_url(api_key=api_key, model=dashscope_model)
            if resolved_audio_url:
                request_input["audio_url"] = resolved_audio_url

        url = f"{self.DASHSCOPE_API_BASE}/api/v1/services/aigc/video-generation/video-synthesis"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "X-DashScope-Async": "enable",
            "Connection": "close",
        }
        if _contains_oss_resource(request_input):
            headers["X-DashScope-OssResourceResolve"] = "enable"
        body = {"model": dashscope_model, "input": request_input, "parameters": parameters}

        timeout_seconds = float(self.timeout_seconds or 600.0)
        create_timeout = (20, max(timeout_seconds, 60.0))
        response = None
        for attempt in range(1, 4):
            try:
                response = requests.post(url, headers=headers, json=body, timeout=create_timeout)
                break
            except requests.exceptions.RequestException as exc:
                if attempt < 3:
                    time.sleep(min(2**attempt, 8))
                    continue
                return self._error(f"DashScope 调用失败：{exc}")
            except Exception as exc:  # noqa: BLE001
                return self._error(f"DashScope 调用失败：{exc}")

        if response is None:
            return self._error("DashScope 调用失败：未获取到响应")

        if not response.ok:
            detail: str | None = None
            try:
                payload = response.json()
                detail = payload.get("message") if isinstance(payload, dict) else None
                if not detail:
                    detail = str(payload)
            except Exception:
                detail = (response.text or "").strip() or None
            safe_hint = {
                "model": dashscope_model,
                "mode": mode,
                "has_img": bool(request_input.get("img_url")),
                "has_reference": bool(request_input.get("reference_video_urls")),
                "has_audio_url": bool(request_input.get("audio_url")),
                "audio_url_scheme": str(request_input.get("audio_url") or "").split(":", 1)[0]
                if request_input.get("audio_url")
                else None,
            }
            return self._error(
                f"DashScope 调用失败：HTTP {response.status_code}。{detail or 'Bad Request'}。request={safe_hint}"
            )

        try:
            data = response.json()
        except Exception as exc:  # noqa: BLE001
            return self._error(f"DashScope 返回非 JSON：{exc}")

        output = data.get("output") if isinstance(data, dict) else None
        task_id = (output or {}).get("task_id")
        if not task_id:
            return self._error(f"DashScope 未返回 task_id：{data}")

        poll_url = f"{self.DASHSCOPE_API_BASE}/api/v1/tasks/{task_id}"
        start_time = time.time()
        max_wait_time = int(float(self.timeout_seconds or 600.0))

        poll_headers = {"Authorization": f"Bearer {api_key}", "Connection": "close"}
        poll_data: dict[str, Any] | None = None
        consecutive_poll_failures = 0
        while True:
            if time.time() - start_time > max_wait_time:
                return self._error(f"DashScope 视频生成超时（>{max_wait_time}s），task_id={task_id}")
            try:
                poll_resp = requests.get(poll_url, headers=poll_headers, timeout=30)
                poll_resp.raise_for_status()
                poll_data = poll_resp.json()
                consecutive_poll_failures = 0
            except requests.exceptions.RequestException as exc:
                consecutive_poll_failures += 1
                if consecutive_poll_failures <= 3:
                    time.sleep(min(2**consecutive_poll_failures, 8))
                    continue
                return self._error(f"DashScope 查询任务失败：{exc}")
            except Exception as exc:  # noqa: BLE001
                return self._error(f"DashScope 查询任务失败：{exc}")

            out = (poll_data or {}).get("output") or {}
            task_status = (out.get("task_status") or poll_data.get("task_status") or "").upper()
            if task_status == "SUCCEEDED":
                break
            if task_status in {"FAILED", "CANCELED"}:
                return self._error(f"DashScope 任务失败：{poll_data.get('message') or poll_data}")
            time.sleep(self.DASHSCOPE_POLL_INTERVAL_SECONDS)

        poll_out = (poll_data or {}).get("output") or {}
        video_url = poll_out.get("video_url")
        if not video_url:
            return self._error(f"DashScope 任务成功但缺少 video_url：{poll_data}")

        audio_input_error: str | None = getattr(self, "_wan_audio_input_error", None)
        generated_at = datetime.now(timezone.utc).isoformat()
        result_payload = {
            "provider": "dashscope",
            "task_id": task_id,
            "task_status": "SUCCEEDED",
            "model": dashscope_model,
            "mode": mode,
            "audio_url_used": bool(resolved_audio_url),
            "audio_url_scheme": (resolved_audio_url or "").split(":", 1)[0] if resolved_audio_url else None,
            "audio_input_error": audio_input_error,
            "prompt": prompt,
            "resolution": resolution,
            "aspect_ratio": "adaptive" if mode == "i2v" else aspect_ratio,
            "duration": duration,
            "parameters": parameters,
            "video_url": video_url,
            "videos": [{"video_url": video_url}],
            "usage": (poll_data or {}).get("usage"),
            "dashscope_request_id": (poll_data or {}).get("request_id") or data.get("request_id"),
            "doubao_preview": {
                "token": task_id,
                "kind": "video",
                "available": True,
                "generated_at": generated_at,
                "payload": {"video_url": video_url, "videos": [{"video_url": video_url}]},
            },
        }
        if audio_input_error and not resolved_audio_url and mode in {"t2v", "i2v"}:
            self.status = f"⚠️ 上游音频无效：{audio_input_error}，已回退自动配音（{dashscope_model}）"
        else:
            self.status = f"✅ wan 视频生成成功 ({dashscope_model})"
        return Data(data=result_payload, type="video")

    def _collect_wan_media_from_first_frame(self) -> dict[str, list[str]]:
        images: list[str] = []
        videos: list[str] = []
        raw = getattr(self, "first_frame_image", None)

        entries: list[Any] = []
        if isinstance(raw, (list, tuple)):
            entries.extend(list(raw))
        elif raw is not None:
            entries.append(raw)

        for entry in entries:
            # Prefer explicit file_path if present (uploaded via LangFlow UI).
            file_path = self._extract_file_path(entry)
            if file_path:
                ext = (Path(file_path).suffix or "").lower().lstrip(".")
                public_url = self._build_public_file_url(file_path, ttl_seconds=3600)
                if not public_url:
                    continue
                if ext in {"mp4", "mov"}:
                    videos.append(public_url)
                else:
                    images.append(public_url)
                continue

            # Otherwise, fall back to embedded/base64/http image data.
            image_url = self._extract_image_url(entry)
            if image_url:
                # Upstream nodes may pass http(s) video URLs here (e.g. video->video edges).
                # Classify by file extension so wan2.6 can enter r2v mode.
                if self._is_video_url(image_url):
                    videos.append(image_url)
                else:
                    images.append(image_url)

        return {"images": images, "videos": videos}

    @staticmethod
    def _is_video_url(url: str) -> bool:
        normalized = (url or "").strip()
        if not normalized:
            return False
        path = normalized.split("?", 1)[0].split("#", 1)[0].lower()
        return path.endswith(".mp4") or path.endswith(".mov")

    @staticmethod
    def _extract_file_path(value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, Data):
            return DoubaoVideoGenerator._extract_file_path(value.data)
        if isinstance(value, dict):
            candidate = value.get("file_path") or value.get("path") or value.get("value")
            if isinstance(candidate, str) and candidate.strip():
                trimmed = candidate.strip()
                # Avoid treating remote URLs as flow file paths.
                if trimmed.startswith(("http://", "https://", "data:", "oss://")):
                    return None
                return trimmed
        if isinstance(value, str) and value.strip():
            trimmed = value.strip()
            if trimmed.startswith(("http://", "https://", "data:", "oss://")):
                return None
            if "/" in trimmed or "\\" in trimmed:
                return trimmed
        return None

    def _resolve_wan_audio_url(self, *, api_key: str, model: str) -> str | None:
        """Resolve audio_url for wan t2v/i2v.

        Rules:
        - If upstream provides a public http(s) url, use it directly.
        - If upstream provides local/base64 audio, upload via DashScope uploads API and return oss://... URL.
        - Otherwise, return None (keep auto voice).
        """

        candidate = self._extract_audio_candidate_from_upstream()
        if not candidate:
            return None

        kind = candidate["kind"]
        if kind == "http":
            return str(candidate["url"])
        if kind == "bytes":
            oss_url = self._dashscope_upload_bytes_to_temporary_oss(
                api_key=api_key,
                model=model,
                file_name=str(candidate["file_name"]),
                content_bytes=bytes(candidate["content"]),
            )
            return oss_url
        return None

    def _extract_audio_candidate_from_upstream(self) -> dict[str, Any] | None:
        audio_input = getattr(self, "audio_input", None)
        data = audio_input.data if isinstance(audio_input, Data) else audio_input
        if not data:
            return None
        items = list(data) if isinstance(data, (list, tuple)) else [data]
        last_error: str | None = None
        for item in items:
            candidate, err = self._extract_audio_candidate_from_upstream_item(item)
            if candidate:
                return candidate
            if err:
                last_error = err
        if last_error:
            self._wan_audio_input_error = last_error  # type: ignore[attr-defined]
        return None

    def _extract_audio_candidate_from_upstream_item(self, value: Any) -> tuple[dict[str, Any] | None, str | None]:
        if value is None:
            return None, None
        if isinstance(value, Data):
            return self._extract_audio_candidate_from_upstream_item(value.data)
        if isinstance(value, dict):
            invalid_reason = self._extract_audio_invalid_reason(value)
            if invalid_reason:
                return None, invalid_reason
            candidate_url = value.get("audio_url") or value.get("url")
            if isinstance(candidate_url, str) and candidate_url.strip().startswith(("http://", "https://")):
                return {"kind": "http", "url": candidate_url.strip()}, None

            file_path = value.get("file_path")
            if isinstance(file_path, str) and file_path.strip():
                payload = self._read_audio_bytes_from_file_path(file_path.strip())
                if payload:
                    return payload, None

            audio_base64 = value.get("audio_base64")
            audio_type = str(value.get("audio_type") or "wav").strip().lower()
            if isinstance(audio_base64, str) and audio_base64.strip():
                decoded = self._decode_base64(audio_base64.strip())
                if decoded:
                    ext = audio_type if audio_type in {"wav", "mp3"} else "wav"
                    return {"kind": "bytes", "file_name": f"audio.{ext}", "content": decoded}, None
            return None, None

        if isinstance(value, str) and value.strip().startswith(("http://", "https://")):
            return {"kind": "http", "url": value.strip()}, None
        return None, None

    @staticmethod
    def _extract_audio_invalid_reason(value: dict[str, Any]) -> str | None:
        # Typical error payload from audio synthesis nodes.
        if isinstance(value.get("type"), str) and value.get("type") == "error":
            err = value.get("error")
            if isinstance(err, str) and err.strip():
                return err.strip()

        preview = value.get("doubao_preview")
        if isinstance(preview, dict) and preview.get("available") is False:
            err = preview.get("error") or preview.get("message")
            if isinstance(err, str) and err.strip():
                return err.strip()

        err = value.get("error")
        if isinstance(err, str) and err.strip():
            return err.strip()
        return None

    def _read_audio_bytes_from_file_path(self, file_path: str) -> dict[str, Any] | None:
        normalized = str(file_path or "").strip()
        if not normalized:
            return None

        file_name = Path(normalized).name or "audio.wav"
        ext = (Path(file_name).suffix or "").lower().lstrip(".")
        ext = ext if ext in {"wav", "mp3"} else "wav"
        if not file_name.lower().endswith(f".{ext}"):
            file_name = f"{Path(file_name).stem}.{ext}"

        # Prefer retrieving bytes through LangFlow's signed public endpoint.
        public_url = self._build_public_file_url(normalized, ttl_seconds=3600)
        if public_url:
            try:
                resp = requests.get(public_url, timeout=60)
                resp.raise_for_status()
                return {"kind": "bytes", "file_name": file_name, "content": resp.content}
            except Exception:
                return None

        # Fallback: treat as a local filesystem path.
        try:
            if Path(normalized).exists():
                return {"kind": "bytes", "file_name": file_name, "content": Path(normalized).read_bytes()}
        except Exception:
            return None
        return None

    @staticmethod
    def _decode_base64(value: str) -> bytes | None:
        try:
            return base64.b64decode(value)
        except Exception:
            return None

    def _dashscope_upload_bytes_to_temporary_oss(
        self, *, api_key: str, model: str, file_name: str, content_bytes: bytes
    ) -> str | None:
        policy = self._dashscope_get_upload_policy(api_key=api_key, model=model)
        if not policy:
            return None
        try:
            upload_dir = str(policy["upload_dir"]).rstrip("/")
            key = f"{upload_dir}/{Path(file_name).name}"
            files = {
                "OSSAccessKeyId": (None, policy["oss_access_key_id"]),
                "Signature": (None, policy["signature"]),
                "policy": (None, policy["policy"]),
                "x-oss-object-acl": (None, policy["x_oss_object_acl"]),
                "x-oss-forbid-overwrite": (None, policy["x_oss_forbid_overwrite"]),
                "key": (None, key),
                "success_action_status": (None, "200"),
                "file": (Path(file_name).name, content_bytes),
            }
            resp = None
            for attempt in range(1, 4):
                try:
                    resp = requests.post(
                        str(policy["upload_host"]),
                        files=files,
                        timeout=(20, 120),
                        headers={"Connection": "close"},
                    )
                    resp.raise_for_status()
                    return f"oss://{key}"
                except requests.exceptions.RequestException:
                    if attempt < 3:
                        time.sleep(min(2**attempt, 8))
                        continue
                    return None
                except Exception:
                    return None
        except Exception:
            return None

    def _dashscope_get_upload_policy(self, *, api_key: str, model: str) -> dict[str, Any] | None:
        try:
            resp = None
            for attempt in range(1, 4):
                try:
                    resp = requests.get(
                        f"{self.DASHSCOPE_API_BASE}/api/v1/uploads",
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json",
                            "Connection": "close",
                        },
                        params={"action": "getPolicy", "model": model},
                        timeout=(20, 30),
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    policy = (data or {}).get("data")
                    return policy if isinstance(policy, dict) else None
                except requests.exceptions.RequestException:
                    if attempt < 3:
                        time.sleep(min(2**attempt, 8))
                        continue
                    return None
                except Exception:
                    return None
        except Exception:
            return None

    def _build_public_file_url(self, file_path: str, *, ttl_seconds: int = 3600) -> str | None:
        parsed = self._parse_flow_file_path(file_path)
        if not parsed:
            return None
        flow_id, file_name = parsed

        secret_key = self._resolve_secret_key()
        if not secret_key:
            return None

        token = generate_public_file_token(
            secret_key=secret_key,
            flow_id=flow_id,
            file_name=file_name,
            ttl_seconds=ttl_seconds,
        )
        base = self._resolve_public_base_url().rstrip("/")
        if not base:
            return None
        return f"{base}/api/v1/files/public/{flow_id}/{file_name}?token={token.value}"

    def _resolve_secret_key(self) -> str:
        try:  # pragma: no cover - runtime dependency
            from langflow.services.deps import get_settings_service

            settings_service = get_settings_service()
            return str(settings_service.auth_settings.SECRET_KEY.get_secret_value() or "")
        except Exception:
            return str(os.getenv("LANGFLOW_SECRET_KEY", "") or "")

    def _resolve_public_base_url(self) -> str:
        explicit = str(os.getenv("LANGFLOW_PUBLIC_BASE_URL", "") or "").strip()
        if explicit:
            return explicit
        try:  # pragma: no cover - runtime dependency
            from langflow.services.deps import get_settings_service

            settings_service = get_settings_service()
            host = str(settings_service.settings.host or "localhost")
            port = int(settings_service.settings.port or 7860)
            scheme = "https" if settings_service.settings.ssl_cert_file else "http"
            return f"{scheme}://{host}:{port}"
        except Exception:
            return ""

    @staticmethod
    def _parse_flow_file_path(file_path: str) -> tuple[str, str] | None:
        normalized = str(file_path or "").replace("\\", "/").lstrip("/").strip()
        if not normalized:
            return None
        parts = [p for p in normalized.split("/") if p]
        if len(parts) < 2:
            return None
        return parts[0], parts[-1]

    @staticmethod
    def _map_wan_resolution(*, resolution: str, model: str) -> str:
        mapping = {"480p": "480P", "720p": "720P", "1080p": "1080P"}
        normalized = mapping.get(resolution.lower().strip())
        if not normalized:
            raise ValueError(f"不支持的分辨率：{resolution}")
        if model.startswith("wan2.6") and normalized == "480P":
            raise ValueError("wan2.6 不支持 480P 分辨率。")
        return normalized

    @staticmethod
    def _enforce_wan_duration(*, model: str, duration: int) -> int:
        duration = int(duration)
        if model in {"wan2.6-t2v", "wan2.6-i2v"}:
            allowed = [5, 10, 15]
        elif model in {"wan2.5-t2v-preview", "wan2.5-i2v-preview"}:
            allowed = [5, 10]
        elif model == "wan2.6-r2v":
            allowed = [5, 10]
        else:
            allowed = [5]
        return duration if duration in allowed else allowed[0]

    @classmethod
    def _normalize_veo_duration(cls, duration: int) -> int:
        try:
            value = int(duration)
        except (TypeError, ValueError):
            value = cls.VEO_SUPPORTED_DURATIONS[0]
        if value in cls.VEO_SUPPORTED_DURATIONS:
            return value
        return cls.VEO_SUPPORTED_DURATIONS[0]

    @staticmethod
    def _map_wan_size(*, resolution: str, aspect_ratio: str) -> str:
        res = resolution.lower().strip()
        ratio = aspect_ratio.strip()
        if ratio == "adaptive":
            raise ValueError("wan t2v/r2v 不支持 adaptive，请选择具体比例。")
        supported = {
            "480p": {"16:9": "832*480", "9:16": "480*832", "1:1": "624*624"},
            "720p": {
                "16:9": "1280*720",
                "9:16": "720*1280",
                "1:1": "960*960",
                "4:3": "1088*832",
                "3:4": "832*1088",
            },
            "1080p": {
                "16:9": "1920*1080",
                "9:16": "1080*1920",
                "1:1": "1440*1440",
                "4:3": "1632*1248",
                "3:4": "1248*1632",
            },
        }
        if res not in supported:
            raise ValueError(f"不支持的分辨率：{resolution}")
        if ratio not in supported[res]:
            raise ValueError(f"{resolution} 不支持比例 {aspect_ratio}")
        return supported[res][ratio]

    INLINE_KEYS = ["image_data_url", "data_url", "preview_base64", "image_base64"]
    URL_KEYS = ["edited_image_url", "image_url", "url", "video_url"]

    def _extract_image_url(self, image_input: Any) -> str | None:
        """从输入或手柄中提取首帧图片引用，支持 Data、字典、列表及本地路径。"""
        if image_input is None:
            return None

        if isinstance(image_input, (list, tuple)):
            for entry in image_input:
                resolved = self._extract_image_url(entry)
                if resolved:
                    return resolved
            return None

        if isinstance(image_input, Data):
            return self._extract_image_url(image_input.data)

        if isinstance(image_input, dict):
            inline_value = self._first_non_empty(image_input, self.INLINE_KEYS)
            if inline_value:
                normalized = self._normalize_data_url(inline_value)
                if normalized:
                    return normalized
            url_value = self._first_non_empty(image_input, self.URL_KEYS)
            if url_value:
                return str(url_value).strip()
            path_candidate = image_input.get("file_path") or image_input.get("path") or image_input.get("value")
            if isinstance(path_candidate, str):
                encoded = self._encode_local_image(path_candidate)
                if encoded:
                    return encoded

            nested_lists = [
                image_input.get("images"),
                image_input.get("generated_images"),
            ]
            for nested in nested_lists:
                if isinstance(nested, list):
                    for entry in nested:
                        if isinstance(entry, dict):
                            nested_url = self._extract_image_url(entry)
                            if nested_url:
                                return nested_url

            preview = image_input.get("doubao_preview")
            if isinstance(preview, dict):
                return self._extract_image_url(preview)

            return None

        if hasattr(image_input, "get_text"):
            return self._extract_image_url(image_input.get_text())

        if hasattr(image_input, "text"):
            return self._extract_image_url(image_input.text)

        if hasattr(image_input, "data") and isinstance(image_input.data, dict):
            return self._extract_image_url(image_input.data)

        if isinstance(image_input, str):
            trimmed = image_input.strip()
            if not trimmed:
                return None
            if trimmed.startswith(("http://", "https://", "data:")):
                return trimmed
            encoded = self._encode_local_image(trimmed)
            if encoded:
                return encoded

        return None

    @staticmethod
    def _first_non_empty(container: dict[str, Any], keys: list[str]) -> str | None:
        for key in keys:
            value = container.get(key)
            if isinstance(value, str) and value.strip():
                return value
        return None

    @staticmethod
    def _normalize_data_url(value: str | None) -> str | None:
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

    def _encode_local_image(self, path_value: str) -> str | None:
        try:
            file_path = self._resolve_local_path(path_value)
            if not file_path or not file_path.exists():
                return None
            mime_type, _ = mimetypes.guess_type(file_path.name)
            mime_type = mime_type or "image/png"
            if not str(mime_type).startswith("image/"):
                return None
            encoded = base64.b64encode(file_path.read_bytes()).decode("utf-8")
            return f"data:{mime_type};base64,{encoded}"
        except Exception:
            return None

    def _resolve_local_path(self, path_value: str) -> Path | None:
        candidate = Path(path_value)
        if candidate.exists():
            return candidate
        try:
            resolved = Path(self.resolve_path(path_value))
            if resolved.exists():
                return resolved
        except Exception:
            pass
        try:
            full = Path(self.get_full_path(path_value))
            if full.exists():
                return full
        except Exception:
            pass
        return None

    @staticmethod
    def _error(message: str) -> Data:
        generated_at = datetime.now(timezone.utc).isoformat()
        suggestion = ""
        lowered = message.lower()
        if "connection error" in lowered or "connect" in lowered or "getaddrinfo" in lowered:
            if "veo" in lowered:
                suggestion = (
                    "（网络连接错误：请检查是否能访问 Veo 地址，或配置 VEO_API_BASE/HTTP_PROXY/HTTPS_PROXY，"
                    "以及防火墙/证书拦截等）"
                )
            elif "sora" in lowered:
                suggestion = (
                    "（网络连接错误：请检查是否能访问 Sora 地址，或配置 SORA_API_BASE/HTTP_PROXY/HTTPS_PROXY，"
                    "以及防火墙/证书拦截等）"
                )
            elif "dashscope" in lowered or "wan" in lowered:
                suggestion = (
                    "（网络连接错误：请检查是否能访问 DashScope 地址，或配置 DASHSCOPE_API_BASE/HTTP_PROXY/HTTPS_PROXY，"
                    "以及防火墙/证书拦截等）"
                )
            elif "doubao" in lowered or "ark" in lowered:
                suggestion = (
                    "（网络连接错误：请检查是否能访问 Ark 地址，或配置 ARK_API_BASE/HTTP_PROXY/HTTPS_PROXY，"
                    "以及防火墙/证书拦截等）"
                )
            else:
                suggestion = (
                    "（网络连接错误：请检查网络/DNS，或是否需要设置 HTTP_PROXY/HTTPS_PROXY，"
                    "以及防火墙/证书拦截等）"
                )
        return Data(
            data={
                "error": f"{message}{suggestion}",
                "doubao_preview": {
                    "token": f"error-{int(time.time())}",
                    "kind": "video",
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

    def _get_cover_preview(self, cover_url: str) -> str | None:
        """获取视频封面图片的base64预览"""
        try:
            response = requests.get(
                cover_url,
                timeout=10,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            )
            response.raise_for_status()

            # 限制图片大小，避免base64过大
            max_size = 3 * 1024 * 1024  # 3MB
            if len(response.content) > max_size:
                return None

            base64_data = base64.b64encode(response.content).decode('utf-8')
            return f"data:image/jpeg;base64,{base64_data}"

        except Exception:
            return None

    def _is_veo_model(self, model_name: str) -> bool:
        """判断是否为 Veo 模型"""
        normalized = str(model_name or "").strip().upper()
        return normalized in {"VEO3.1", "VEO3.1-FAST"}

    def _is_sora_model(self, model_name: str) -> bool:
        """判断是否为 Sora 模型"""
        normalized = str(model_name or "").strip().lower()
        return normalized in {"sora-2", "sora-2-pro"}

    def _resolve_api_key(self, *, provider: str, env_vars: tuple[str, ...]) -> str | None:
        """解析 API Key，优先级：Provider Credentials > 环境变量 > 组件参数

        Provider Credentials 读取顺序：指定的 provider -> openai（对所有模型）-> google（仅 Veo）
        """
        candidates: list[str] = []

        # 1. 优先从 Provider Credentials 读取
        try:
            from langflow.services.deps import get_settings_service

            settings_service = get_settings_service()
            config_dir = settings_service.settings.config_dir

            # 读取指定的 provider
            provider_creds = get_provider_credentials(provider, config_dir)
            if provider_creds and provider_creds.api_key and not provider_creds.api_key.startswith("****"):
                candidates.append(str(provider_creds.api_key).strip())

            # openai 供应商对所有模型都可用（作为备选）
            openai_creds = get_provider_credentials("openai", config_dir)
            if openai_creds and openai_creds.api_key and not openai_creds.api_key.startswith("****"):
                candidates.append(str(openai_creds.api_key).strip())

            # google 供应商仅对 Veo 模型作为备选
            if provider == "gemini":
                google_creds = get_provider_credentials("google", config_dir)
                if google_creds and google_creds.api_key and not google_creds.api_key.startswith("****"):
                    candidates.append(str(google_creds.api_key).strip())
        except Exception:
            pass

        # 2. 检查环境变量
        import os
        for env_var in env_vars:
            key = os.getenv(env_var, "")
            if key and not key.startswith("****"):
                candidates.append(str(key).strip())

        # 3. 最后检查组件参数中的 api_key
        component_api_key = getattr(self, "api_key", None)
        if component_api_key:
            key = str(component_api_key).strip()
            if key and not key.startswith("****"):
                candidates.append(key)

        # 返回第一个有效的 API Key
        for key in candidates:
            if key:
                return key

        return None

    def _collect_veo_entries_from_first_frame(self, raw: Any) -> list[dict[str, Any]]:
        """从 first_frame_image 收集 Veo 需要的条目（包含角色信息）"""
        def _to_list(value: Any) -> list[Any]:
            if value is None:
                return []
            if isinstance(value, (list, tuple)):
                return [item for item in value if item is not None]
            return [value]

        def _normalize_role(value: Any | None) -> str | None:
            if not isinstance(value, str):
                return None
            normalized = value.strip().lower()
            if not normalized:
                return None
            alias_map = {
                "start": "first",
                "first_frame": "first",
                "last_frame": "last",
                "ref": "reference",
            }
            normalized = alias_map.get(normalized, normalized)
            if normalized in {"first", "reference", "last"}:
                return normalized
            return None

        # UI 会把 FileInput 存成一个对象：{ value: [...], file_path: [...] }
        # 其中 value 里可能含 role，file_path 里是对应的路径/URL。
        container: dict[str, Any] | None = None
        if isinstance(raw, Data) and isinstance(raw.data, dict):
            container = raw.data
        elif isinstance(raw, dict):
            container = raw

        values: list[Any]
        paths: list[Any]
        if container is not None and ("value" in container or "file_path" in container):
            values = _to_list(container.get("value"))
            paths = _to_list(container.get("file_path"))
        else:
            values = _to_list(raw)
            paths = []

        default_role = "first" if max(len(values), len(paths)) <= 1 else "reference"
        length = max(len(values), len(paths))
        entries: list[dict[str, Any]] = []
        for idx in range(length):
            value_entry = values[idx] if idx < len(values) else None
            path_entry = paths[idx] if idx < len(paths) else None

            url = self._extract_image_url(path_entry) or self._extract_image_url(value_entry)
            if not url:
                continue

            role: str = default_role
            role_source: dict[str, Any] | None = None
            if isinstance(value_entry, Data) and isinstance(value_entry.data, dict):
                role_source = value_entry.data
            elif isinstance(value_entry, dict):
                role_source = value_entry

            if role_source is not None:
                direct = _normalize_role(role_source.get("role"))
                if direct:
                    role = direct
                else:
                    nested = role_source.get("value")
                    if isinstance(nested, dict):
                        nested_role = _normalize_role(nested.get("role"))
                        if nested_role:
                            role = nested_role

            entries.append({"url": url, "role": role})

        return entries

    # Veo 国内代理配置
    VEO_API_BASE = "https://new.12ai.org"
    VEO_POLL_INTERVAL = 5  # 轮询间隔（秒）
    VEO_MAX_WAIT_TIME = 600  # 最大等待时间（秒）

    def _build_video_veo(self, *, prompt: str, endpoint_id: str, api_key: str) -> Data:
        """使用 Veo 3.1 国内代理 API 生成视频"""
        if not api_key or not api_key.strip():
            return self._error("未配置 Veo API Key，请在 .env 中配置 GEMINI_API_KEY/GOOGLE_API_KEY")

        try:
            requested_endpoint_id = endpoint_id

            # 获取参数并验证
            resolution = str(getattr(self, "resolution", "720p") or "720p").strip()
            duration = self._normalize_veo_duration(getattr(self, "duration", 8) or 8)
            aspect_ratio = str(getattr(self, "aspect_ratio", "16:9") or "16:9").strip()

            # 强制参数验证
            if resolution not in self.VEO_SUPPORTED_RESOLUTIONS:
                resolution = "720p"
            if aspect_ratio not in self.VEO_SUPPORTED_RATIOS:
                aspect_ratio = "16:9"

            # 收集图片输入并识别模式
            first_frame_url = None
            last_frame_url = None
            reference_images = []

            # 处理 first_frame_image with roles
            first_frame_raw = getattr(self, "first_frame_image", None)
            if first_frame_raw:
                entries = self._collect_veo_entries_from_first_frame(first_frame_raw)
                for entry in entries:
                    role = entry.get("role", "first")
                    url = entry.get("url")
                    if not url:
                        continue

                    if role == "first":
                        if not first_frame_url:
                            first_frame_url = url
                        else:
                            self.status = "⚠️ Veo 3.1: 检测到多个首帧输入，仅使用第一张"
                    elif role == "last":
                        if not last_frame_url:
                            last_frame_url = url
                        else:
                            self.status = "⚠️ Veo 3.1: 检测到多个尾帧输入，仅使用第一张"
                    elif role == "reference":
                        reference_images.append(url)

            # 去重并保持顺序
            if reference_images:
                seen: set[str] = set()
                deduped: list[str] = []
                for url in reference_images:
                    if url in seen:
                        continue
                    seen.add(url)
                    deduped.append(url)
                reference_images = deduped

            # 处理 last_frame_image (兼容独立输入)
            if not last_frame_url:
                last_frame_raw = getattr(self, "last_frame_image", None)
                if last_frame_raw:
                    url = self._extract_image_url(last_frame_raw)
                    if url:
                        last_frame_url = url

            # 检测模式
            has_first = bool(first_frame_url)
            has_last = bool(last_frame_url)
            has_reference = bool(reference_images)

            # 稳定性优先：只要设置了首帧/尾帧，就按 images 模式走，参考图会被忽略（由前端提示用户）
            if has_reference and (has_first or has_last):
                reference_images = []
                has_reference = False
                self.status = "⚠️ Veo 3.1: 检测到首帧/尾帧输入，参考图将被忽略（首/尾帧优先）"
            if has_last and not has_first:
                return self._error("Veo 3.1: 插值模式需要同时提供首帧与尾帧")

            is_reference_mode = has_reference
            is_interpolation_mode = has_first and has_last

            # 智能切换：参考图模式仅标准版支持
            if is_reference_mode and endpoint_id == "veo-3.1-fast-generate-preview":
                endpoint_id = "veo-3.1-generate-preview"
                self.status = "⚠️ Veo 3.1: 检测到参考图输入，已自动从 fast 切换到标准版模型"

            # 模型限制检查
            is_fast_model = endpoint_id == "veo-3.1-fast-generate-preview"

            # 参考图模式：仅标准版支持，必须是 16:9 和 8 秒
            if is_reference_mode:
                if is_fast_model:
                    return self._error("参考图片功能仅 veo-3.1-generate-preview（标准版）支持，快速版不支持")
                if aspect_ratio != "16:9":
                    return self._error("Veo 3.1 使用参考图时仅支持 16:9 比例")
                if duration != 8:
                    duration = 8
                    self.status = "⚠️ Veo 3.1: 参考图模式仅支持 8 秒时长，已自动调整"

            # 插值模式必须 8 秒
            if is_interpolation_mode and duration != 8:
                duration = 8
                self.status = "⚠️ Veo 3.1: 插值模式仅支持 8 秒时长，已自动调整"

            # Veo 3.1: 1080p 仅在 8 秒时可用。为保证用户选择的时长生效，自动降级到 720p。
            if resolution == "1080p" and duration != 8:
                resolution = "720p"

            # 构建请求体
            request_payload = {
                "model": endpoint_id,
                "prompt": prompt,
            }

            # 添加图片（images 数组）
            images_list = []
            if first_frame_url:
                images_list.append(first_frame_url)
            if last_frame_url:
                images_list.append(last_frame_url)

            if images_list:
                request_payload["images"] = images_list

            # metadata - 仅在需要时添加
            metadata = None

            # 添加参考图片（仅标准版，且不能与 images 同时使用）
            if is_reference_mode and not is_fast_model:
                if len(reference_images) > 3:
                    self.status = f"⚠️ 参考图超过 3 张，仅使用前 3 张"
                    reference_images = reference_images[:3]

                # 构建参考图片对象
                ref_images_payload = []
                for ref_url in reference_images:
                    # 转换图片格式为 API 需要的格式
                    # 注意：referenceImages 支持 HTTP URL 直接使用（会自动下载）
                    # 也支持 base64 字符串
                    ref_images_payload.append({
                        "image": {
                            "bytesBase64Encoded": ref_url  # 直接使用 URL 或 base64
                        },
                        "referenceType": "asset"
                    })

                if ref_images_payload:
                    metadata = {
                        "aspectRatio": aspect_ratio,
                        "durationSeconds": duration,
                        "resolution": resolution,
                        "referenceImages": ref_images_payload
                    }

            # 插值模式或图生视频模式，只添加必要的 metadata 参数
            elif is_interpolation_mode or images_list:
                # 帧插值必须指定 durationSeconds: 8
                # 图生视频可以选择性添加 metadata
                metadata = {
                    "durationSeconds": duration,
                    "resolution": resolution,
                }
                # 如果不是默认比例，添加 aspectRatio
                if aspect_ratio != "16:9":
                    metadata["aspectRatio"] = aspect_ratio

            # 纯文生视频模式：当用户显式选择了非默认参数时仍需传递 metadata
            else:
                if duration != 8 or aspect_ratio != "16:9" or resolution != "720p":
                    metadata = {"durationSeconds": duration, "resolution": resolution}
                    if aspect_ratio != "16:9":
                        metadata["aspectRatio"] = aspect_ratio

            # 只有当 metadata 不为空时才添加到请求中
            if metadata:
                request_payload["metadata"] = metadata

            # 发送请求
            url = f"{self.VEO_API_BASE}/v1/videos"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            }

            self.status = f"📋 创建 Veo 视频生成任务... (模式: {'参考图' if is_reference_mode else '插值' if is_interpolation_mode else '文生/图生'})"

            debug_enabled = str(os.getenv("LANGFLOW_VEO_DEBUG", "")).strip().lower() in {"1", "true", "yes"}
            if debug_enabled:
                import json

                safe_headers = dict(headers)
                if "Authorization" in safe_headers:
                    safe_headers["Authorization"] = "Bearer ****"
                request_debug = json.dumps(request_payload, ensure_ascii=False, indent=2)
                if len(request_debug) > 4000:
                    request_debug = request_debug[:4000] + "...<truncated>"
                print(f"[VEO DEBUG] 请求 URL: {url}", file=__import__('sys').stderr)
                print(f"[VEO DEBUG] 请求 Headers: {safe_headers}", file=__import__('sys').stderr)
                print(f"[VEO DEBUG] 请求 Body: {request_debug}", file=__import__('sys').stderr)

            try:
                create_response = requests.post(url, headers=headers, json=request_payload, timeout=60)
                if debug_enabled:
                    print(f"[VEO DEBUG] 响应状态码: {create_response.status_code}", file=__import__('sys').stderr)
                    print(f"[VEO DEBUG] 响应 Headers: {dict(create_response.headers)}", file=__import__('sys').stderr)
                    print(f"[VEO DEBUG] 响应 Body: {create_response.text[:1000]}", file=__import__('sys').stderr)
                create_response.raise_for_status()
                create_result = create_response.json()
            except requests.HTTPError as exc:
                error_detail = str(exc)
                if exc.response is not None:
                    try:
                        error_json = exc.response.json()
                        if "error" in error_json:
                            error_info = error_json["error"]
                            error_detail = f"{error_info.get('status', '')}: {error_info.get('message', '')}"
                    except Exception:
                        error_detail = exc.response.text[:300]
                return self._error(f"Veo API 调用失败 [HTTP {exc.response.status_code if exc.response else 'Unknown'}]: {error_detail}")
            except Exception as exc:
                return self._error(f"Veo API 调用失败: {exc}")

            # 检查错误
            if "error" in create_result:
                return self._error(f"Veo API 返回错误: {create_result['error']}")

            # 获取 task_id
            task_id = create_result.get("task_id")
            if not task_id:
                return self._error(f"Veo API 未返回 task_id: {create_result}")

            self.status = f"⏳ Veo 任务已创建 (ID: {task_id})，开始轮询..."

            # 轮询查询任务状态
            start_time = time.time()
            poll_url = f"{self.VEO_API_BASE}/v1/videos/{task_id}"

            while True:
                # 检查超时
                if time.time() - start_time > self.VEO_MAX_WAIT_TIME:
                    return self._error(f"Veo 视频生成超时（>{self.VEO_MAX_WAIT_TIME}s），task_id={task_id}")

                try:
                    poll_response = requests.get(poll_url, headers=headers, timeout=30)
                    poll_response.raise_for_status()
                    poll_result = poll_response.json()
                except requests.HTTPError as exc:
                    return self._error(f"查询 Veo 任务状态失败 [HTTP {exc.response.status_code if exc.response else 'Unknown'}]")
                except Exception as exc:
                    return self._error(f"查询 Veo 任务状态失败: {exc}")

                status = poll_result.get("status", "")
                progress = poll_result.get("progress", 0)

                if status == "completed":
                    self.status = f"✅ Veo 视频生成成功！"
                    break
                elif status == "failure":
                    fail_reason = poll_result.get("fail_reason", "未知错误")
                    return self._error(f"Veo 视频生成失败: {fail_reason}")
                else:
                    self.status = f"⏳ Veo 生成中... 状态: {status}, 进度: {progress}%"
                    time.sleep(self.VEO_POLL_INTERVAL)

            # 获取视频 URL
            video_url = f"{self.VEO_API_BASE}/v1/videos/{task_id}/content"

            # 尝试下载视频并转换为 base64，以便前端可以直接播放
            video_base64 = None
            inline_limit = self._resolve_inline_video_limit()
            if inline_limit > 0:
                try:
                    self.status = "📥 正在下载视频..."
                    video_response = requests.get(video_url, headers=headers, timeout=60)
                    video_response.raise_for_status()

                    # 检查内容类型
                    content_type = video_response.headers.get("Content-Type", "video/mp4")

                    if len(video_response.content) <= inline_limit:
                        # 转换为 base64
                        import base64

                        video_data = base64.b64encode(video_response.content).decode("utf-8")
                        video_base64 = f"data:{content_type};base64,{video_data}"
                        self.status = "✅ 视频下载成功"
                    else:
                        self.status = "✅ 视频已生成（内容过大，跳过 base64 内联）"
                except Exception as e:
                    self.status = f"⚠️ 视频下载失败，将使用 URL: {str(e)}"
                    video_base64 = None

            # 构建返回数据
            result_data = {
                "task_id": task_id,
                "status": "completed",
                "video_url": video_url,
                "video_base64": video_base64,  # 添加 base64 编码的视频
                "model": {
                    "name": self.model_name,
                    "model_id": endpoint_id,
                    **({"requested_model_id": requested_endpoint_id} if requested_endpoint_id != endpoint_id else {}),
                },
                "prompt": prompt,
                "resolution": resolution,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                "mode": "reference" if is_reference_mode else "interpolation" if is_interpolation_mode else "text/image",
                "generation_time": int(time.time() - start_time),
                "first_frame_used": has_first,
                "last_frame_used": has_last,
                "reference_count": len(reference_images),
                "doubao_preview": {
                    "token": task_id,
                    "kind": "video",
                    "available": True,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "payload": {
                        "video_url": video_url,
                        "video_base64": video_base64,  # 添加 base64 编码的视频
                        "task_id": task_id,
                        "duration": duration,
                        "resolution": resolution,
                        "aspect_ratio": aspect_ratio,
                    },
                },
            }

            self.status = f"✅ Veo 视频生成成功 ({resolution}, {duration}秒, {aspect_ratio})"
            return Data(data=result_data, type="video")

        except Exception as exc:
            import traceback
            error_details = traceback.format_exc()
            return self._error(f"Veo 调用失败: {exc}\n{error_details}")

    def _normalize_veo_image(self, image_source: str) -> str | None:
        """
        将各种图片格式转换为 Veo API 需要的格式
        返回：HTTP(S) URL、Base64 字符串或 Data URI
        """
        try:
            # 已经是 HTTP(S) URL
            if image_source.startswith("http://") or image_source.startswith("https://"):
                return image_source

            # Data URI 格式，直接返回
            if image_source.startswith("data:image"):
                # 提取 base64 部分
                if ";base64," in image_source:
                    return image_source.split(";base64,", 1)[1]
                return image_source

            # 纯 Base64 字符串（尝试解码验证）
            trimmed = image_source.strip()
            if ";" not in trimmed and "," not in trimmed and not trimmed.startswith("data:"):
                try:
                    base64.b64decode(trimmed)
                    return trimmed
                except Exception:
                    pass

            # 本地文件路径
            local_path = self._resolve_local_path(trimmed)
            if local_path and local_path.exists():
                with open(local_path, "rb") as f:
                    image_data = f.read()

                # 限制大小
                max_size = 10 * 1024 * 1024  # 10MB
                if len(image_data) > max_size:
                    return None

                mime_type, _ = mimetypes.guess_type(str(local_path))
                mime_type = mime_type or "image/jpeg"

                base64_data = base64.b64encode(image_data).decode("utf-8")
                return base64_data

            return None
        except Exception:
            return None

    def _build_video_sora(self, *, prompt: str, endpoint_id: str, api_key: str) -> Data:
        """使用 Sora 2/2-Pro 国内代理 API 生成视频"""
        if not api_key or not api_key.strip():
            return self._error("未配置 OpenAI API Key，请在 .env 中配置 OPENAI_API_KEY 或在 Settings - Provider Credentials - OpenAI 中配置")

        try:
            # 获取参数
            model_limits = self.MODEL_LIMITS.get(self.model_name, {})
            duration = int(getattr(self, "duration", 10) or 10)
            requested_duration = duration
            resolution = str(getattr(self, "resolution", "1080p") or "1080p").strip()
            aspect_ratio = str(getattr(self, "aspect_ratio", "16:9") or "16:9").strip()
            configured_group = str(getattr(self, "sora_group", "auto") or "auto").strip().lower()
            if configured_group in {"", "auto"}:
                configured_group = str(model_limits.get("channel_type") or "auto").strip().lower()
            configured_distributor = str(getattr(self, "sora_distributor", "") or "").strip()

            # 获取可用配置
            available_durations = model_limits.get("available_durations", [10, 15])
            available_sizes = model_limits.get("available_sizes", ["720x1280", "1280x720", "1024x1792", "1792x1024"])

            # 验证并调整 duration
            if duration not in available_durations:
                duration = available_durations[0]
                self.status = f"⚠️ Sora: 时长 {requested_duration} 不支持，已调整为 {duration} 秒"

            # Sora 使用 size 参数（如 "1280x720"），而不是 aspect_ratio。
            # 国内接入文档给出的 size 选项仅覆盖横/竖屏两类尺寸：低分辨率(1280x720/720x1280) 与高分辨率(1792x1024/1024x1792)。
            normalized_ratio = aspect_ratio.strip()
            if normalized_ratio not in {"16:9", "9:16"}:
                normalized_ratio = "16:9"
            normalized_resolution = resolution.lower().replace(" ", "")
            use_high_res = normalized_resolution.startswith("1080")

            if normalized_ratio == "16:9":
                size = "1792x1024" if use_high_res else "1280x720"
                preferred_sizes = ["1280x720", "1792x1024"]
            else:
                size = "1024x1792" if use_high_res else "720x1280"
                preferred_sizes = ["720x1280", "1024x1792"]

            if size not in available_sizes:
                for candidate in preferred_sizes:
                    if candidate in available_sizes:
                        size = candidate
                        break
                else:
                    size = available_sizes[0]

            # 构建 API 请求
            api_base = str(getattr(self, "sora_api_base", self.SORA_API_BASE) or self.SORA_API_BASE).strip().rstrip("/")
            query: dict[str, str] = {}
            if configured_group and configured_group != "auto":
                query["group"] = configured_group
            if configured_distributor:
                query["distributor"] = configured_distributor
            query_suffix = f"?{urlencode(query)}" if query else ""
            url = f"{api_base}/v1/videos{query_suffix}"

            self.status = f"📋 创建 Sora 视频生成任务... (model: {endpoint_id}, size: {size}, duration: {duration}s)"

            try:
                response = None
                files = None
                payload = {
                    "model": endpoint_id,
                    "prompt": prompt,
                    "seconds": str(duration),
                    "size": size,
                }

                # 处理参考图片（input_reference）
                reference_image_raw = getattr(self, "first_frame_image", None)
                if reference_image_raw:
                    reference_image_url = self._extract_image_url(reference_image_raw)
                    if reference_image_url:
                        try:
                            import io
                            if reference_image_url.startswith("data:image/"):
                                mime_and_data = reference_image_url.split(",", 1)
                                mime_type = mime_and_data[0].split(":")[1].split(";")[0]
                                base64_data = mime_and_data[1]
                                image_bytes = base64.b64decode(base64_data)
                            elif reference_image_url.startswith(("http://", "https://")):
                                ref_response = requests.get(reference_image_url, timeout=60)
                                ref_response.raise_for_status()
                                mime_type = ref_response.headers.get("Content-Type", "image/jpeg")
                                mime_type = mime_type.split(";")[0].strip()
                                if not mime_type.startswith("image/"):
                                    mime_type = "image/jpeg"
                                image_bytes = ref_response.content
                            else:
                                image_bytes = None
                                mime_type = None
                            if image_bytes and mime_type:
                                ext = mimetypes.guess_extension(mime_type) or ".jpg"
                                filename = f"reference{ext}"
                                files = {"input_reference": (filename, io.BytesIO(image_bytes), mime_type)}
                        except Exception as exc:
                            return self._error(f"Sora 参考图处理失败: {exc}")

                headers = {"Authorization": f"Bearer {api_key}"}
                if files:
                    # 带参考图：multipart/form-data
                    response = requests.post(url, headers=headers, data=payload, files=files, timeout=60)
                else:
                    # 无参考图：使用 application/json（文档明确支持），避免发送 x-www-form-urlencoded 导致 415/400
                    response = requests.post(url, headers=headers, json=payload, timeout=60)
                response.raise_for_status()
                create_result = response.json()
            except requests.HTTPError as exc:
                error_detail = str(exc)
                http_response = getattr(exc, "response", None) or response
                if http_response is not None:
                    try:
                        error_json = http_response.json()
                        if "error" in error_json:
                            error_info = error_json["error"]
                            error_detail = f"{error_info.get('message', error_info)}"
                    except Exception:
                        error_detail = str(http_response.text)[:500]
                status_code = getattr(http_response, "status_code", None) or "Unknown"
                if "无可用渠道" in error_detail or "distributor" in error_detail:
                    error_detail = (
                        f"{error_detail}\n"
                        "提示：这通常表示你的 token 在当前分组/渠道下未开通该模型。"
                        "可尝试在节点高级参数中设置 `sora_group`/`sora_distributor`，或联系服务商开通。"
                    )
                return self._error(f"Sora API 调用失败 [HTTP {status_code}]: {error_detail}")
            except Exception as exc:
                return self._error(f"Sora API 调用失败: {exc}")

            # 检查错误
            if "error" in create_result:
                return self._error(f"Sora API 返回错误: {create_result['error']}")

            # 获取 task_id
            task_id = create_result.get("id")
            if not task_id:
                return self._error(f"Sora API 未返回 task_id: {create_result}")

            self.status = f"⏳ Sora 任务已创建 (ID: {task_id})，开始轮询..."

            # 轮询查询任务状态
            timeout_seconds = int(getattr(self, "sora_timeout_seconds", self.SORA_DEFAULT_TIMEOUT) or self.SORA_DEFAULT_TIMEOUT)
            start_time = time.time()
            poll_url = f"{api_base}/v1/videos/{task_id}{query_suffix}"

            while True:
                # 检查超时
                if time.time() - start_time > timeout_seconds:
                    return self._error(f"Sora 视频生成超时（>{timeout_seconds}s），task_id={task_id}")

                try:
                    poll_headers = {"Authorization": f"Bearer {api_key}"}
                    poll_response = requests.get(poll_url, headers=poll_headers, timeout=30)
                    poll_response.raise_for_status()
                    poll_result = poll_response.json()
                except requests.HTTPError as exc:
                    status_code = getattr(getattr(exc, "response", None), "status_code", None) or "Unknown"
                    return self._error(f"查询 Sora 任务状态失败 [HTTP {status_code}]")
                except Exception as exc:
                    return self._error(f"查询 Sora 任务状态失败: {exc}")

                status = poll_result.get("status", "")
                progress = poll_result.get("progress", 0)

                if status == "completed":
                    self.status = f"✅ Sora 视频生成成功！"
                    break
                elif status == "failed":
                    fail_reason = poll_result.get("error", {}).get("message", "未知错误")
                    return self._error(f"Sora 视频生成失败: {fail_reason}")
                else:
                    self.status = f"⏳ Sora 生成中... 状态: {status}, 进度: {progress}%"
                    time.sleep(self.SORA_POLL_INTERVAL_SECONDS)

            # 获取视频 URL
            video_url = poll_result.get("video_url")
            if not video_url:
                return self._error(f"Sora 任务成功但缺少 video_url: {poll_result}")

            # 构建返回数据
            result_data = {
                "provider": "sora",
                "task_id": task_id,
                "task_status": "completed",
                "model": {
                    "name": self.model_name,
                    "model_id": endpoint_id,
                },
                "prompt": prompt,
                "size": size,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                "resolution": resolution,
                "generation_time": int(time.time() - start_time),
                "reference_image_used": bool(reference_image_raw),
                "video_url": video_url,
                "videos": [{"video_url": video_url}],
                "doubao_preview": {
                    "token": task_id,
                    "kind": "video",
                    "available": True,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "payload": {
                        "video_url": video_url,
                        "videos": [{"video_url": video_url}],
                        "task_id": task_id,
                    },
                },
            }

            self.status = f"✅ Sora 视频生成成功 ({size}, {duration}秒)"
            return Data(data=result_data, type="video")

        except Exception as exc:
            import traceback
            error_details = traceback.format_exc()
            return self._error(f"Sora 调用失败: {exc}\n{error_details}")

    @staticmethod
    def _first_url_from_payload(value: Any) -> str | None:
        """Best-effort extraction of a video url from heterogeneous upstream responses."""
        if value is None:
            return None
        if isinstance(value, str):
            candidate = value.strip()
            if candidate.startswith(("http://", "https://")):
                return candidate
            return None
        if isinstance(value, dict):
            # Prefer explicit keys.
            for key in ("video_url", "url", "download_url", "content_url"):
                v = value.get(key)
                if isinstance(v, str) and v.strip().startswith(("http://", "https://")):
                    return v.strip()
            for v in value.values():
                found = DoubaoVideoGenerator._first_url_from_payload(v)
                if found:
                    return found
            return None
        if isinstance(value, (list, tuple)):
            for v in value:
                found = DoubaoVideoGenerator._first_url_from_payload(v)
                if found:
                    return found
        return None

    @staticmethod
    def _resolve_inline_video_limit() -> int:
        raw = str(os.getenv("LANGFLOW_VIDEO_INLINE_MAX_BYTES", "")).strip()
        if not raw:
            return DoubaoVideoGenerator.DEFAULT_VIDEO_INLINE_MAX_BYTES
        try:
            value = int(raw)
        except ValueError:
            return DoubaoVideoGenerator.DEFAULT_VIDEO_INLINE_MAX_BYTES
        return max(value, 0)

    def _gateway_content_url(self, *, task_id: str) -> str:
        """Best-effort URL for fetching video bytes through our own gateway endpoint."""
        base = str(self._resolve_public_base_url() or "").rstrip("/")
        if base:
            return f"{base}/v1/videos/{task_id}/content"
        return f"/v1/videos/{task_id}/content"

    def _poll_gateway_video(
        self,
        *,
        task_id: str,
        prompt: str,
        endpoint_id: str,
        model_display_name: str,
        resolution: str,
        duration: int,
        aspect_ratio: str,
        content_url_override: str | None = None,
        max_wait: int = 600,
        poll_interval: int = 3,
    ) -> Data:
        """Shared polling loop for gateway video tasks."""
        from langflow.gateway.client import videos_status

        start = time.time()
        self.status = f"Task created (ID: {task_id}), polling..."
        last_status: str | None = None

        while time.time() - start < max_wait:
            poll = videos_status(video_id=task_id, user_id=str(getattr(self, "user_id", "") or "") or None)
            status = str(poll.get("status") or "").lower()
            if status and status != last_status:
                last_status = status
                self.status = f"Polling: {status}"

            if status in {"failed", "failure", "error", "cancelled", "canceled"}:
                return self._error(f"Video task failed: {poll.get('provider_response')}")

            video_url = None
            if content_url_override:
                video_url = content_url_override
            else:
                data = poll.get("data") if isinstance(poll.get("data"), dict) else None
                if data and isinstance(data.get("url"), str):
                    video_url = data.get("url")
                if not video_url:
                    video_url = self._first_url_from_payload(poll.get("provider_response"))

            done = status in {"completed", "succeeded", "success", "succeed", "done", "partial_succeeded"}
            if video_url and (done or not status):
                generated_at = datetime.now(timezone.utc).isoformat()
                result_payload = {
                    "provider": "gateway",
                    "task_id": task_id,
                    "task_status": status or "completed",
                    "model": {"name": model_display_name, "model_id": endpoint_id},
                    "prompt": prompt,
                    "resolution": resolution,
                    "duration": duration,
                    "aspect_ratio": aspect_ratio,
                    "generation_time": int(time.time() - start),
                    "video_url": video_url,
                    "videos": [{"video_url": video_url}],
                    "provider_response": poll.get("provider_response"),
                    "doubao_preview": {
                        "token": task_id,
                        "kind": "video",
                        "available": True,
                        "generated_at": generated_at,
                        "payload": {
                            "video_url": video_url,
                            "videos": [{"video_url": video_url}],
                            "task_id": task_id,
                            "duration": duration,
                            "resolution": resolution,
                            "aspect_ratio": aspect_ratio,
                        },
                    },
                }
                self.status = "Video generated"
                return Data(data=result_payload, type="video")

            time.sleep(poll_interval)

        return self._error(f"Video generation timed out ({max_wait}s), task_id={task_id}")

    @staticmethod
    def _is_kling_model(model_name: str) -> bool:
        return str(model_name or "").strip().lower().startswith("kling")

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
            # Split "1,2 3" style.
            for part in s.replace("，", ",").replace(" ", ",").split(","):
                part = part.strip()
                if not part:
                    continue
                try:
                    out.append(int(part))
                except ValueError:
                    continue
        return out

    def _collect_kling_media(self) -> dict[str, Any]:
        """Collect Kling image_list/video_list inputs from FileInput(s).

        - Images: from first_frame_image (role-aware) + last_frame_image (optional end_frame).
        - Videos: from first_frame_image (mp4/mov).
        """

        # 1) Collect images/videos from first_frame_image (supports upload + role annotations).
        images: list[dict[str, Any]] = []
        videos: list[dict[str, Any]] = []

        raw = getattr(self, "first_frame_image", None)

        # UI stores FileInput as { value: [...], file_path: [...] } (value may include role).
        container: dict[str, Any] | None = None
        if isinstance(raw, Data) and isinstance(raw.data, dict):
            container = raw.data
        elif isinstance(raw, dict):
            container = raw

        values: list[Any] = []
        paths: list[Any] = []
        if container is not None and ("value" in container or "file_path" in container):
            values = container.get("value") if isinstance(container.get("value"), list) else [container.get("value")]
            paths = container.get("file_path") if isinstance(container.get("file_path"), list) else [container.get("file_path")]
            values = [v for v in values if v is not None]
            paths = [p for p in paths if p is not None]
        else:
            if isinstance(raw, (list, tuple)):
                values = list(raw)
            elif raw is not None:
                values = [raw]

        def _normalize_role(value: Any | None) -> str | None:
            if not isinstance(value, str):
                return None
            normalized = value.strip().lower()
            if not normalized:
                return None
            alias_map = {
                "start": "first",
                "first_frame": "first",
                "end_frame": "last",
                "last_frame": "last",
                "ref": "reference",
            }
            normalized = alias_map.get(normalized, normalized)
            if normalized in {"first", "reference", "last"}:
                return normalized
            return None

        default_role = "first" if max(len(values), len(paths)) <= 1 else "reference"
        length = max(len(values), len(paths))

        for idx in range(length):
            value_entry = values[idx] if idx < len(values) else None
            path_entry = paths[idx] if idx < len(paths) else None

            role = default_role
            role_source: dict[str, Any] | None = None
            if isinstance(value_entry, Data) and isinstance(value_entry.data, dict):
                role_source = value_entry.data
            elif isinstance(value_entry, dict):
                role_source = value_entry
            if role_source is not None:
                direct = _normalize_role(role_source.get("role"))
                if direct:
                    role = direct
                else:
                    nested = role_source.get("value")
                    if isinstance(nested, dict):
                        nested_role = _normalize_role(nested.get("role"))
                        if nested_role:
                            role = nested_role

            file_path = self._extract_file_path(path_entry) or self._extract_file_path(value_entry)
            if file_path:
                ext = (Path(str(file_path)).suffix or "").lower().lstrip(".")
                public_url = self._build_public_file_url(str(file_path), ttl_seconds=3600)
                if public_url:
                    if ext in {"mp4", "mov"}:
                        videos.append({"video_url": public_url, "role": role, "source": "upload"})
                        continue
                    images.append({"image_url": public_url, "role": role, "source": "upload"})
                    continue

            # Fallback: embedded/base64/http(s) values.
            url = self._extract_image_url(path_entry) or self._extract_image_url(value_entry)
            if not url:
                continue
            if self._is_video_url(url):
                videos.append({"video_url": url, "role": role, "source": "url"})
            else:
                images.append({"image_url": url, "role": role, "source": "url"})

        # 2) Optional end frame (separate input) if not already present.
        last_frame_raw = getattr(self, "last_frame_image", None)
        if last_frame_raw:
            last_url = self._extract_image_url(last_frame_raw)
            if last_url and not any(i.get("role") == "last" for i in images):
                images.append({"image_url": last_url, "role": "last", "source": "last_frame_image"})

        # 3) Build Kling structures (image_list/video_list).
        image_list: list[dict[str, Any]] = []
        has_first = False
        has_last = False
        for entry in images:
            image_url = entry.get("image_url")
            if not isinstance(image_url, str) or not image_url.strip():
                continue
            role = str(entry.get("role") or "reference")
            item: dict[str, Any] = {"image_url": image_url}
            if role == "first":
                item["type"] = "first_frame"
                has_first = True
            elif role == "last":
                item["type"] = "end_frame"
                has_last = True
            image_list.append(item)

        # Kling requires first_frame when end_frame is provided.
        if has_last and not has_first:
            # Best-effort: promote the first non-end_frame image to first_frame.
            promoted = False
            for item in image_list:
                if item.get("type") != "end_frame":
                    item["type"] = "first_frame"
                    promoted = True
                    break
            if not promoted:
                raise ValueError("kling O1: 使用尾帧(end_frame)时必须同时提供首帧(first_frame)。")

        # Kling: if more than 2 images, end_frame is not supported. Best-effort: drop end_frame.
        if len(image_list) > 2 and any(i.get("type") == "end_frame" for i in image_list):
            image_list = [i for i in image_list if i.get("type") != "end_frame"]

        # Docs limits:
        # - with reference video: <= 4 images
        # - without reference video: <= 7 images
        if videos and len(image_list) > 4:
            raise ValueError("kling O1：有参考视频时，参考图片数量不得超过 4。请减少图片数量或移除参考视频。")
        if not videos and len(image_list) > 7:
            raise ValueError("kling O1：无参考视频时，参考图片数量不得超过 7。请减少图片数量。")

        video_list: list[dict[str, Any]] = []
        if videos:
            # Kling currently supports up to 1 video.
            first_video = videos[0]
            video_url = first_video.get("video_url")
            if isinstance(video_url, str) and video_url.strip():
                refer_type = str(getattr(self, "kling_video_refer_type", "") or "").strip() or "feature"
                keep_original_sound = str(getattr(self, "kling_keep_original_sound", "") or "").strip() or "yes"
                video_list.append(
                    {
                        "video_url": video_url,
                        "refer_type": refer_type,
                        "keep_original_sound": keep_original_sound,
                    }
                )

        return {"image_list": image_list, "video_list": video_list}

    def _build_video_kling_gateway(self, *, prompt: str, endpoint_id: str) -> Data:
        """Kling Omni-Video (kling-video-o1) via hosted gateway."""
        try:
            from langflow.gateway.client import videos_create

            # Kling uses aspect_ratio (16:9, 9:16, 1:1) and duration (3-10, scenario-dependent).
            resolution = str(getattr(self, "resolution", "") or "").strip()
            raw_ratio = str(getattr(self, "aspect_ratio", "16:9") or "16:9").strip()
            ratio = raw_ratio if raw_ratio in {"16:9", "9:16", "1:1"} else "16:9"

            raw_duration = int(getattr(self, "duration", 5) or 5)
            duration = max(3, min(raw_duration, 10))

            mode = str(getattr(self, "kling_mode", "pro") or "pro").strip() or "pro"
            if mode not in {"std", "pro"}:
                mode = "pro"

            refer_type = str(getattr(self, "kling_video_refer_type", "") or "feature").strip() or "feature"
            if refer_type not in {"feature", "base"}:
                refer_type = "feature"

            media = self._collect_kling_media()
            image_list = media["image_list"]
            video_list = media["video_list"]

            if refer_type == "base" and not video_list:
                return self._error("kling O1：选择视频编辑（refer_type=base）时必须提供一段参考视频（mp4/mov）。")

            # Video editing cannot define first/end frame; downgrade to plain reference images.
            if refer_type == "base" and image_list:
                for item in image_list:
                    if isinstance(item, dict) and "type" in item:
                        item.pop("type", None)

            # For pure t2v / first-frame generation, Kling often only supports 5 or 10 seconds.
            if not video_list and (not image_list or any(i.get("type") == "first_frame" for i in image_list)):
                if duration not in {5, 10}:
                    duration = 5 if duration < 8 else 10

            element_ids = self._parse_int_list(getattr(self, "kling_element_ids", None))
            element_list = [{"element_id": eid} for eid in element_ids]

            callback_url = str(getattr(self, "kling_callback_url", "") or "").strip()
            external_task_id = str(getattr(self, "kling_external_task_id", "") or "").strip()

            kling_payload: dict[str, Any] = {
                "model_name": "kling-video-o1",
                "prompt": prompt,
                "mode": mode,
            }
            # Kling docs: duration is ignored for video-editing (refer_type=base); aspect_ratio is also irrelevant there.
            if refer_type != "base":
                if ratio:
                    kling_payload["aspect_ratio"] = ratio
                if duration:
                    kling_payload["duration"] = str(duration)
            if image_list:
                kling_payload["image_list"] = image_list
            if video_list:
                kling_payload["video_list"] = video_list
            if element_list:
                kling_payload["element_list"] = element_list
            if callback_url:
                kling_payload["callback_url"] = callback_url
            if external_task_id:
                kling_payload["external_task_id"] = external_task_id

            create = videos_create(
                model=endpoint_id,
                prompt=prompt,
                duration=duration,
                ratio=ratio,
                extra_body={"kling_payload": kling_payload},
                user_id=str(getattr(self, "user_id", "") or "") or None,
            )
            task_id = str(create.get("id") or "").strip()
            if not task_id:
                return self._error(f"Gateway did not return task id: {create}")

            return self._poll_gateway_video(
                task_id=task_id,
                prompt=prompt,
                endpoint_id=endpoint_id,
                model_display_name=str(self.model_name or endpoint_id),
                resolution=resolution,
                duration=duration,
                aspect_ratio=ratio,
                max_wait=900,
                poll_interval=3,
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gateway kling video failed: {exc}")

    def _build_video_wan_gateway(self, *, prompt: str, model_name: str) -> Data:
        """WAN (DashScope) video generation via hosted gateway."""
        try:
            from langflow.gateway.client import videos_create

            resolution = str(getattr(self, "resolution", "1080p") or "1080p").strip()
            duration = int(getattr(self, "duration", 5) or 5)
            aspect_ratio = str(getattr(self, "aspect_ratio", "16:9") or "16:9").strip()

            media = self._collect_wan_media_from_first_frame()
            reference_urls = media["videos"]
            img_url = media["images"][0] if media["images"] else None

            if reference_urls and model_name != "wan2.6":
                return self._error("wan2.5 does not support reference-video (r2v). Use wan2.6 or remove reference video.")

            if reference_urls:
                dashscope_model = "wan2.6-r2v"
                mode = "r2v"
            elif img_url:
                dashscope_model = "wan2.6-i2v" if model_name == "wan2.6" else "wan2.5-i2v-preview"
                mode = "i2v"
            else:
                dashscope_model = "wan2.6-t2v" if model_name == "wan2.6" else "wan2.5-t2v-preview"
                mode = "t2v"

            duration = self._enforce_wan_duration(model=dashscope_model, duration=duration)

            extra_body: dict[str, Any] = {"watermark": False, "prompt_extend": True}
            if mode in ("t2v", "r2v"):
                extra_body["size"] = self._map_wan_size(resolution=resolution, aspect_ratio=aspect_ratio)
            else:
                extra_body["resolution"] = self._map_wan_resolution(resolution=resolution, model=dashscope_model)

            if mode == "i2v" and img_url:
                extra_body["img_url"] = img_url
            if mode == "r2v" and reference_urls:
                extra_body["reference_video_urls"] = reference_urls[:3]

            # Optional audio_input: pass url directly; if bytes are provided, let the gateway upload to temporary OSS.
            candidate = self._extract_audio_candidate_from_upstream()
            if candidate and candidate.get("kind") == "http":
                extra_body["audio_url"] = str(candidate.get("url"))
            elif candidate and candidate.get("kind") == "bytes":
                extra_body["audio_file_name"] = str(candidate.get("file_name") or "audio.wav")
                extra_body["audio_bytes"] = bytes(candidate.get("content") or b"")

            create = videos_create(
                model=dashscope_model,
                prompt=prompt,
                duration=duration,
                extra_body=extra_body,
                user_id=str(getattr(self, "user_id", "") or "") or None,
            )
            task_id = str(create.get("id") or "").strip()
            if not task_id:
                return self._error(f"Gateway did not return task id: {create}")

            return self._poll_gateway_video(
                task_id=task_id,
                prompt=prompt,
                endpoint_id=dashscope_model,
                model_display_name=model_name,
                resolution=resolution,
                duration=duration,
                aspect_ratio=aspect_ratio,
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gateway wan video failed: {exc}")

    def _build_video_veo_gateway(self, *, prompt: str, endpoint_id: str) -> Data:
        """Veo video generation via hosted gateway."""
        try:
            from langflow.gateway.client import videos_create

            resolution = str(getattr(self, "resolution", "720p") or "720p").strip()
            duration = self._normalize_veo_duration(getattr(self, "duration", 8) or 8)
            aspect_ratio = str(getattr(self, "aspect_ratio", "16:9") or "16:9").strip()

            if resolution not in self.VEO_SUPPORTED_RESOLUTIONS:
                resolution = "720p"
            if aspect_ratio not in self.VEO_SUPPORTED_RATIOS:
                aspect_ratio = "16:9"

            # Collect inputs (first/last/reference) from first_frame_image role annotations.
            first_frame_url = None
            last_frame_url = None
            reference_images: list[str] = []
            first_frame_raw = getattr(self, "first_frame_image", None)
            if first_frame_raw:
                entries = self._collect_veo_entries_from_first_frame(first_frame_raw)
                for entry in entries:
                    role = entry.get("role", "first")
                    url = entry.get("url")
                    if not url:
                        continue
                    if role == "first" and not first_frame_url:
                        first_frame_url = url
                    elif role == "last" and not last_frame_url:
                        last_frame_url = url
                    elif role == "reference":
                        reference_images.append(url)

            if not last_frame_url:
                last_frame_raw = getattr(self, "last_frame_image", None)
                if last_frame_raw:
                    last_frame_url = self._extract_image_url(last_frame_raw)

            has_first = bool(first_frame_url)
            has_last = bool(last_frame_url)
            has_reference = bool(reference_images)

            if has_reference and (has_first or has_last):
                reference_images = []
                has_reference = False
            if has_last and not has_first:
                return self._error("Veo requires first+last frame together for interpolation mode.")

            is_reference_mode = has_reference
            is_interpolation_mode = has_first and has_last

            # Reference-images require the standard model.
            if is_reference_mode and endpoint_id == "veo-3.1-fast-generate-preview":
                endpoint_id = "veo-3.1-generate-preview"

            is_fast_model = endpoint_id == "veo-3.1-fast-generate-preview"
            if is_reference_mode:
                if is_fast_model:
                    return self._error("Reference images are only supported on veo-3.1-generate-preview (not fast).")
                if aspect_ratio != "16:9":
                    return self._error("Veo reference-image mode only supports 16:9.")
                if duration != 8:
                    duration = 8
            if is_interpolation_mode and duration != 8:
                duration = 8

            # Veo 3.1: 1080p only supports 8s. Downgrade to 720p to keep the requested duration.
            if resolution == "1080p" and duration != 8:
                resolution = "720p"

            request_payload: dict[str, Any] = {"model": endpoint_id, "prompt": prompt}
            images_list: list[str] = []
            if first_frame_url:
                images_list.append(first_frame_url)
            if last_frame_url:
                images_list.append(last_frame_url)
            if images_list:
                request_payload["images"] = images_list

            metadata: dict[str, Any] | None = None
            if is_reference_mode and not is_fast_model:
                ref_images_payload: list[dict[str, Any]] = []
                for ref_url in reference_images[:3]:
                    ref_images_payload.append({"image": {"bytesBase64Encoded": ref_url}, "referenceType": "asset"})
                if ref_images_payload:
                    metadata = {
                        "aspectRatio": aspect_ratio,
                        "durationSeconds": duration,
                        "resolution": resolution,
                        "referenceImages": ref_images_payload,
                    }
            elif is_interpolation_mode or images_list:
                metadata = {"durationSeconds": duration, "resolution": resolution}
                if aspect_ratio != "16:9":
                    metadata["aspectRatio"] = aspect_ratio
            else:
                if duration != 8 or aspect_ratio != "16:9" or resolution != "720p":
                    metadata = {"durationSeconds": duration, "resolution": resolution}
                    if aspect_ratio != "16:9":
                        metadata["aspectRatio"] = aspect_ratio

            if metadata:
                request_payload["metadata"] = metadata

            from langflow.gateway.client import videos_content, videos_status

            create = videos_create(
                model=endpoint_id,
                prompt=prompt,
                duration=duration,
                ratio=aspect_ratio,
                extra_body={"veo_payload": request_payload},
                user_id=str(getattr(self, "user_id", "") or "") or None,
            )
            task_id = str(create.get("id") or "").strip()
            if not task_id:
                return self._error(f"Gateway did not return task id: {create}")

            start = time.time()
            max_wait = 600
            poll_interval = 3
            last_status: str | None = None
            poll: dict[str, Any] = {}

            while time.time() - start < max_wait:
                poll = videos_status(video_id=task_id, user_id=str(getattr(self, "user_id", "") or "") or None)
                status = str(poll.get("status") or "").lower()
                if status and status != last_status:
                    last_status = status
                    self.status = f"Polling: {status}"

                if status in {"failed", "failure", "error", "cancelled", "canceled"}:
                    return self._error(f"Veo task failed: {poll.get('provider_response')}")
                if status in {"completed", "succeeded", "success", "done"}:
                    break

                time.sleep(poll_interval)

            if not poll:
                return self._error(f"Veo status missing, task_id={task_id}")

            data = poll.get("data") if isinstance(poll.get("data"), dict) else None
            video_url = data.get("url") if data and isinstance(data.get("url"), str) else None
            if not video_url:
                video_url = self._first_url_from_payload(poll.get("provider_response"))

            # Fetch bytes server-side (best-effort) so the UI does not need upstream credentials.
            video_base64: str | None = None
            inline_limit = self._resolve_inline_video_limit()
            if inline_limit > 0:
                try:
                    content_bytes, content_type = videos_content(
                        video_id=task_id, user_id=str(getattr(self, "user_id", "") or "") or None
                    )
                    if isinstance(content_bytes, (bytes, bytearray)) and content_bytes:
                        if len(content_bytes) <= inline_limit:
                            b64 = base64.b64encode(bytes(content_bytes)).decode("utf-8")
                            ctype = str(content_type or "video/mp4")
                            video_base64 = f"data:{ctype};base64,{b64}"
                except Exception:
                    video_base64 = None

            generated_at = datetime.now(timezone.utc).isoformat()
            result_payload = {
                "provider": "gateway",
                "task_id": task_id,
                "task_status": str(poll.get("status") or "completed"),
                "video_url": video_url,
                "video_base64": video_base64,
                "model": {"name": str(self.model_name or endpoint_id), "model_id": endpoint_id},
                "prompt": prompt,
                "resolution": resolution,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                "mode": "reference" if is_reference_mode else "interpolation" if is_interpolation_mode else "text/image",
                "generation_time": int(time.time() - start),
                "first_frame_used": bool(first_frame_url),
                "last_frame_used": bool(last_frame_url),
                "reference_count": len(reference_images),
                "provider_response": poll.get("provider_response"),
                "doubao_preview": {
                    "token": task_id,
                    "kind": "video",
                    "available": True,
                    "generated_at": generated_at,
                    "payload": {
                        "video_url": video_url,
                        "video_base64": video_base64,
                        "task_id": task_id,
                        "duration": duration,
                        "resolution": resolution,
                        "aspect_ratio": aspect_ratio,
                        "mode": "reference" if is_reference_mode else "interpolation" if is_interpolation_mode else "text/image",
                    },
                },
            }
            self.status = "Veo video generated"
            return Data(data=result_payload, type="video")
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gateway veo video failed: {exc}")

    def _build_video_sora_gateway(self, *, prompt: str, endpoint_id: str) -> Data:
        """Sora video generation via hosted gateway."""
        try:
            from langflow.gateway.client import videos_create

            duration = int(getattr(self, "duration", 10) or 10)
            aspect_ratio = str(getattr(self, "aspect_ratio", "16:9") or "16:9").strip()

            # Sora uses size (e.g. 1280x720 / 720x1280).
            normalized_ratio = aspect_ratio.strip()
            if normalized_ratio not in {"16:9", "9:16"}:
                normalized_ratio = "16:9"
            use_high_res = str(getattr(self, "resolution", "1080p") or "1080p").strip() == "1080p"
            if normalized_ratio == "16:9":
                size = "1792x1024" if use_high_res else "1280x720"
            else:
                size = "1024x1792" if use_high_res else "720x1280"

            group = str(getattr(self, "sora_group", "") or "").strip()
            if group == "auto":
                group = ""
            distributor = str(getattr(self, "sora_distributor", "") or "").strip()

            input_reference = None
            first_frame_raw = getattr(self, "first_frame_image", None)
            if first_frame_raw:
                # Encode the first available image as a data URL for SoraProvider multipart support.
                url_or_data = self._extract_image_url(first_frame_raw)
                if isinstance(url_or_data, str) and url_or_data.startswith("data:image/"):
                    input_reference = url_or_data
                elif isinstance(url_or_data, str) and url_or_data.startswith(("http://", "https://")):
                    try:
                        resp = requests.get(url_or_data, timeout=30)
                        resp.raise_for_status()
                        if len(resp.content) <= 10 * 1024 * 1024:
                            ctype = resp.headers.get("Content-Type") or "image/jpeg"
                            b64 = base64.b64encode(resp.content).decode("utf-8")
                            input_reference = f"data:{ctype};base64,{b64}"
                    except Exception:
                        input_reference = None

            extra_body: dict[str, Any] = {"size": size}
            if group:
                extra_body["group"] = group
            if distributor:
                extra_body["distributor"] = distributor
            if input_reference:
                extra_body["input_reference"] = input_reference

            create = videos_create(
                model=endpoint_id,
                prompt=prompt,
                duration=duration,
                ratio=normalized_ratio,
                extra_body=extra_body,
                user_id=str(getattr(self, "user_id", "") or "") or None,
            )
            task_id = str(create.get("id") or "").strip()
            if not task_id:
                return self._error(f"Gateway did not return task id: {create}")

            return self._poll_gateway_video(
                task_id=task_id,
                prompt=prompt,
                endpoint_id=endpoint_id,
                model_display_name=str(self.model_name or endpoint_id),
                resolution=str(getattr(self, "resolution", "1080p") or "1080p").strip(),
                duration=duration,
                aspect_ratio=aspect_ratio,
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Gateway sora video failed: {exc}")

    def _build_video_gateway(self, *, prompt: str, endpoint_id: str, model_display_name: str) -> Data:
        """Fallback path: generate video via Hosted Gateway for Ark/Doubao models."""
        try:
            from langflow.gateway.client import videos_create

            resolution = str(getattr(self, "resolution", "1080p") or "1080p").strip()
            duration = int(getattr(self, "duration", 5) or 5)
            aspect_ratio = str(getattr(self, "aspect_ratio", "16:9") or "16:9").strip()

            # Build an Ark-compatible content payload (text + optional frames).
            text_params = f"{prompt} --ratio {aspect_ratio} --dur {duration} --resolution {resolution}"
            content: list[dict[str, Any]] = [{"type": "text", "text": text_params}]

            first_frame_url = self._extract_image_url(getattr(self, "first_frame_image", None))
            if first_frame_url:
                self.status = f"🖼️ 使用首帧图片: {first_frame_url[:50]}..."
                content.append({"type": "image_url", "image_url": {"url": first_frame_url}, "role": "first_frame"})

            model_limits = self.MODEL_LIMITS.get(model_display_name, {})
            supports_last_frame = model_limits.get("supports_last_frame", True)
            last_frame_url = self._extract_image_url(getattr(self, "last_frame_image", None))
            if last_frame_url and not supports_last_frame:
                return self._error("当前模型不支持尾帧输入，请切换模型或清空尾帧。")
            if first_frame_url and last_frame_url:
                return self._error("豆包模型不支持首尾帧同时输入，请只保留首帧或尾帧。")
            if last_frame_url:
                self.status = f"🖼️ 使用尾帧图片: {last_frame_url[:50]}..."
                content.append({"type": "image_url", "image_url": {"url": last_frame_url}, "role": "last_frame"})

            create = videos_create(
                model=endpoint_id,
                prompt=prompt,
                extra_body={"content": content},
                user_id=str(getattr(self, "user_id", "") or "") or None,
            )
            task_id = str(create.get("id") or "").strip()
            if not task_id:
                return self._error(f"网关未返回任务 ID: {create}")
            max_wait = 1200 if "1-5-pro" in endpoint_id or "1.5-pro" in model_display_name else 600
            return self._poll_gateway_video(
                task_id=task_id,
                prompt=prompt,
                endpoint_id=endpoint_id,
                model_display_name=model_display_name,
                resolution=resolution,
                duration=duration,
                aspect_ratio=aspect_ratio,
                max_wait=max_wait,
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"网关调用失败: {exc}")


def _contains_oss_resource(payload: Any) -> bool:
    if payload is None:
        return False
    if isinstance(payload, str):
        return payload.strip().startswith("oss://")
    if isinstance(payload, dict):
        return any(_contains_oss_resource(v) for v in payload.values())
    if isinstance(payload, (list, tuple)):
        return any(_contains_oss_resource(v) for v in payload)
    return False


if __name__ == "__main__":
    print("DoubaoVideoGenerator component loaded successfully for LFX system")
