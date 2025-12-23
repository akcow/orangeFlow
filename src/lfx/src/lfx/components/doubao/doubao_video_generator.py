"""豆包文生视频 LFX 组件 - 适配版"""

from __future__ import annotations

import os
import time
import base64
import mimetypes
import requests
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from volcenginesdkarkruntime import Ark

# LFX系统导入
from lfx.custom.custom_component.component import Component
from lfx.schema.data import Data
from lfx.components.doubao.shared_credentials import resolve_credentials
from lfx.inputs.inputs import (
    DropdownInput,
    IntInput,
    SecretStrInput,
    MultilineInput,
    FileInput,
)
from lfx.template.field.base import Output

load_dotenv()


class DoubaoVideoGenerator(Component):
    """调用豆包文生视频接口的 LFX 组件，支持异步生成和状态轮询。"""

    display_name = "豆包文生视频"
    description = ""
    icon = "DoubaoVideoGenerator"
    name = "DoubaoVideoGenerator"

    # 模型配置映射：UI显示名称 -> API端点ID
    MODEL_MAPPING = {
        "Doubao-Seedance-1.0-pro-fast｜251015": "ep-20251031203218-q62sm",
    }

    inputs = [
        DropdownInput(
            name="model_name",
            display_name="模型名称",
            options=[
                "Doubao-Seedance-1.0-pro-fast｜251015"
            ],
            value="Doubao-Seedance-1.0-pro-fast｜251015",  # 使用UI显示的模型名称作为默认值
            required=True,
            info="选择豆包文生视频模型，UI显示模型名称，API调用使用对应的端点ID。",
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
        DropdownInput(
            name="resolution",
            display_name="视频分辨率",
            options=[ "480p","720p", "1080p"],
            value="1080p",
            required=False,
            info="生成视频的分辨率，1080p为推荐选项。",
        ),
        IntInput(
            name="duration",
            display_name="视频时长",
            required=False,
            value=5,
            info="生成视频的时长（秒），范围2-12秒。",
        ),
        FileInput(
            name="first_frame_image",
            display_name="首帧图输入",
            is_list=True,
            list_add_label="继续添加候选图",
            file_types=["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff"],
            input_types=["Data"],
            info="可选：上传参考图或连接上游图片节点，用作图生视频首帧。",
        ),
        SecretStrInput(
            name="api_key",
            display_name="豆包 API 密钥",
            required=False,
            value=os.getenv("ARK_API_KEY", ""),
            placeholder="如留空将读取 .env 中的 ARK_API_KEY",
            info="用于访问豆包 API 的密钥，可在节点中覆盖默认值。",
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
            return self._error("提示词不能为空，请输入或连接提示词。")

        creds = resolve_credentials(
            component_app_id=None,
            component_access_token=None,
            component_api_key=self.api_key,
            env_api_key_var="ARK_API_KEY",
        )
        api_key = (creds.api_key or "").strip()
        if not api_key:
            return self._error("未检测到豆包 API 密钥，请在节点或 .env 中配置 ARK_API_KEY。")

        # 初始化Ark客户端
        client = Ark(
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            api_key=api_key,
        )

        # 准备API参数
        try:
            resolution = str(self.resolution or "1080p")
            duration = int(self.duration or 5)
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
        text_params = f"{merged_prompt} --resolution {resolution} --duration {duration} --camerafixed {str(camera_fixed).lower()} --watermark {str(watermark).lower()}"

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
                }
            })
        else:
            self.status = "📝 未提供首帧图片，进行纯文生视频"

        # 构建生成参数
        generate_params = {
            "model": endpoint_id,  # 使用端点ID进行API调用
            "content": content
        }

        try:
            # 创建视频生成任务
            self.status = "📋 创建视频生成任务..."
            create_result = client.content_generation.tasks.create(**generate_params)
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
                "camera_fixed": camera_fixed,
                "watermark": watermark,
                "model_display_name": self.model_name,  # UI显示的模型名称
                "model_endpoint_id": endpoint_id,  # API调用使用的端点ID
                "generation_time": int(time.time() - start_time),
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

            # 方法1: 检查 content 属性（豆包视频生成的主要方式）
            if hasattr(get_result, 'content') and get_result.content:
                try:
                    content_obj = get_result.content
                    video_url = None
                    cover_url = None

                    # 从content对象中提取URL
                    if hasattr(content_obj, 'video_url'):
                        video_url = content_obj.video_url
                    if hasattr(content_obj, 'cover_url'):
                        cover_url = content_obj.cover_url
                    if hasattr(content_obj, 'last_frame_url'):
                        cover_url = content_obj.last_frame_url

                    if video_url:
                        video_results = [{
                            "index": 0,
                            "video_url": video_url,
                            "cover_url": cover_url,
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

                    # 尝试提取时长信息
                    if hasattr(result, 'duration'):
                        video_data["duration"] = result.duration

                    # 如果是字典类型
                    elif isinstance(result, dict):
                        video_data["video_url"] = result.get('url') or result.get('video_url')
                        video_data["cover_url"] = result.get('cover_url')
                        video_data["duration"] = result.get('duration')

                    # 如果获取到了视频URL，添加到结果中
                    if video_data["video_url"]:
                        video_results.append(video_data)

        except Exception as e:
            # 解析失败时返回空列表，但记录错误
            print(f"解析结果数组时出错: {e}")

        return video_results

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


if __name__ == "__main__":
    print("DoubaoVideoGenerator component loaded successfully for LFX system")
