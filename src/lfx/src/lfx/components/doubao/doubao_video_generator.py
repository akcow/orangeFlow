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

from dotenv import load_dotenv

from volcenginesdkarkruntime import Ark

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
from lfx.utils.provider_credentials import DEFAULT_PROVIDER_KEY, get_provider_credentials

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
    }

    MODEL_LIMITS = {
        "Doubao-Seedance-1.5-pro｜251215": {
            "resolutions": ["480p", "720p"],
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
        },
        "veo3.1-fast": {
            "resolutions": ["720p", "1080p"],
            "min_duration": 4,
            "max_duration": 8,
            "supports_last_frame": True,
        },
    }

    SUPPORTED_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"]
    VEO_SUPPORTED_RATIOS = ["16:9", "9:16"]
    VEO_SUPPORTED_DURATIONS = [4, 6, 8]

    DASHSCOPE_API_BASE = "https://dashscope.aliyuncs.com"
    DASHSCOPE_POLL_INTERVAL_SECONDS = 2.0

    inputs = [
        DropdownInput(
            name="model_name",
            display_name="模型名称",
            options=list(MODEL_MAPPING.keys()),
            value="Doubao-Seedance-1.0-pro-fast｜251015",  # 使用UI显示的模型名称作为默认值
            required=True,
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
            info="生成视频的分辨率，1080p为推荐选项。",
        ),
        IntInput(
            name="duration",
            display_name="视频时长",
            required=False,
            value=5,
            info="生成视频的时长（秒）。Doubao: 2-12s；wan2.6: 5/10/15；wan2.5: 5/10。",
        ),
        DropdownInput(
            name="aspect_ratio",
            display_name="视频宽高比",
            options=SUPPORTED_RATIOS,
            value="16:9",
            required=False,
            info="设置视频的宽高比，支持常见比例及adaptive自适应选项。",
        ),
        FileInput(
            name="first_frame_image",
            display_name="首帧图输入",
            is_list=True,
            list_add_label="继续添加候选图",
            file_types=["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "mp4", "mov"],
            input_types=["Data"],
            info="可选：上传图片或视频，或连接上游图片节点（wan2.6：上传视频将作为参考生视频输入）。",
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
            info="可选：覆盖模型所需的 API Key。\n- Doubao/Ark 模型：使用 ARK_API_KEY\n- wan/DashScope 模型：使用 DASHSCOPE_API_KEY\n",
            load_from_db=False,
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
        if model_name.startswith("wan2."):
            return self._build_video_dashscope(prompt=merged_prompt, model_name=model_name)
        if self._is_veo_model(model_name):
            api_key = self._resolve_api_key(provider="google", env_vars=("GEMINI_API_KEY", "GOOGLE_API_KEY"))
            if not api_key:
                return self._error(
                    "未检测到 Gemini API Key，请在节点或 .env 中配置 GEMINI_API_KEY/GOOGLE_API_KEY，"
                    "或在 密钥配置 - Google / 默认密钥 中输入。"
                )
            endpoint_id = self.MODEL_MAPPING.get(model_name, model_name)
            return self._build_video_veo(prompt=merged_prompt, endpoint_id=endpoint_id, api_key=api_key)

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
                images.append(image_url)

        return {"images": images, "videos": videos}

    @staticmethod
    def _extract_file_path(value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, Data):
            return DoubaoVideoGenerator._extract_file_path(value.data)
        if isinstance(value, dict):
            candidate = value.get("file_path") or value.get("path") or value.get("value")
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        if isinstance(value, str) and value.strip() and "/" in value:
            return value.strip()
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
        if "connection error" in lowered or "connect" in lowered:
            suggestion = (
                "（网络连接错误：请检查是否能访问 DashScope 地址，或是否需要设置代理 HTTP_PROXY/HTTPS_PROXY，"
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
