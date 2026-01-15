from __future__ import annotations

import base64
import time
from pathlib import Path
from typing import Any, Dict

import httpx

from langflow.gateway.errors import UpstreamError
from langflow.gateway.providers.base import ProviderAdapter
from langflow.gateway.schemas import ImageGenerationRequest, VideoGenerationRequest


class DashScopeProvider(ProviderAdapter):
    """Adapter for DashScope (Wan image/video)."""

    def __init__(self, api_key: str, base_url: str | None = None):
        super().__init__(api_key, base_url)
        # base_url is expected to be a host root (no /api/v1 suffix).
        self.base_url = (base_url or "https://dashscope.aliyuncs.com").rstrip("/")

    @staticmethod
    def _dashscope_api(path: str) -> str:
        path = "/" + path.lstrip("/")
        return f"/api/v1{path}"

    @staticmethod
    def _normalize_size(value: str | None) -> str | None:
        if not value:
            return None
        v = str(value).strip()
        if not v:
            return None
        # DashScope uses "*" while other parts of the codebase use "x".
        return v.replace("x", "*").replace("X", "*")

    async def image_generation(self, request: ImageGenerationRequest) -> Dict[str, Any]:
        extra = request.extra_body or {}
        images = extra.get("images") or extra.get("image") or []
        if isinstance(images, str):
            images = [images]
        if not isinstance(images, list):
            images = []

        negative_prompt = extra.get("negative_prompt") or ""
        seed = extra.get("seed") or 0
        prompt_extend = bool(extra.get("prompt_extend", True))
        watermark = bool(extra.get("watermark", False))
        # DashScope expects size like "2048*2048".
        size = self._normalize_size(extra.get("size") or request.size)

        # Heuristic: wan2.6 models support the newer multimodal-generation sync API;
        # wan2.5 models are often async-only.
        force_async = bool(extra.get("force_async", False))
        is_wan26 = str(request.model).startswith("wan2.6")
        use_sync = is_wan26 and not force_async

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                if use_sync:
                    url = f"{self.base_url}{self._dashscope_api('/services/aigc/multimodal-generation/generation')}"
                    content: list[dict[str, Any]] = [{"text": request.prompt}]
                    for image in images:
                        content.append({"image": image})

                    parameters: dict[str, Any] = {"prompt_extend": prompt_extend, "watermark": watermark, "n": request.n}
                    if size:
                        parameters["size"] = size
                    if negative_prompt:
                        parameters["negative_prompt"] = negative_prompt
                    if seed and int(seed) > 0:
                        parameters["seed"] = int(seed)
                    # i2i tends to work better with interleave disabled.
                    if images:
                        parameters["enable_interleave"] = False

                    payload = {
                        "model": request.model,
                        "input": {"messages": [{"role": "user", "content": content}]},
                        "parameters": parameters,
                    }

                    resp = await client.post(url, headers=headers, json=payload)
                    if resp.status_code != 200:
                        raise UpstreamError(resp.text, provider="dashscope", code=f"UPSTREAM_{resp.status_code}")
                    data = resp.json()

                    # Try to extract urls from common DashScope response shapes.
                    urls: list[str] = []
                    output = data.get("output") or {}
                    choices = output.get("choices") or []
                    if isinstance(choices, list) and choices:
                        message = (choices[0] or {}).get("message") or {}
                        contents = message.get("content") or []
                        if isinstance(contents, list):
                            for item in contents:
                                if not isinstance(item, dict):
                                    continue
                                url = item.get("image") or item.get("url") or item.get("image_url")
                                if isinstance(url, str) and url.strip():
                                    urls.append(url.strip())
                    if not urls:
                        # Fallback to older results list.
                        results = output.get("results") or []
                        if isinstance(results, list):
                            for item in results:
                                if isinstance(item, dict) and isinstance(item.get("url"), str):
                                    urls.append(item["url"])

                    return {
                        "created": int(time.time()),
                        "data": [{"url": u} for u in urls],
                        "provider_response": data,
                    }

                # Async protocol (text2image/image2image) + polling.
                endpoint = "/services/aigc/text2image/image-synthesis" if not images else "/services/aigc/image2image/image-synthesis"
                url = f"{self.base_url}{self._dashscope_api(endpoint)}"
                async_headers = {**headers, "X-DashScope-Async": "enable"}

                input_body: dict[str, Any] = {"prompt": request.prompt}
                if images:
                    input_body["images"] = images
                if negative_prompt:
                    input_body["negative_prompt"] = negative_prompt

                parameters: dict[str, Any] = {"n": request.n, "prompt_extend": prompt_extend, "watermark": watermark}
                if size:
                    parameters["size"] = size
                if seed and int(seed) > 0:
                    parameters["seed"] = int(seed)

                payload = {"model": request.model, "input": input_body, "parameters": parameters}
                resp = await client.post(url, headers=async_headers, json=payload)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="dashscope", code=f"UPSTREAM_{resp.status_code}")
                data = resp.json()
                output = data.get("output") or {}
                task_id = output.get("task_id") or output.get("taskId")
                if not task_id:
                    raise UpstreamError(f"Missing task_id in response: {data}", provider="dashscope")

                return await self._poll_image_task(client=client, task_id=str(task_id), headers=headers)
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="dashscope")

    async def _poll_image_task(self, *, client: httpx.AsyncClient, task_id: str, headers: dict[str, str]) -> Dict[str, Any]:
        poll_url = f"{self.base_url}{self._dashscope_api(f'/tasks/{task_id}')}"
        deadline = time.time() + 600.0
        while time.time() < deadline:
            resp = await client.get(poll_url, headers={"Authorization": headers["Authorization"]}, timeout=30.0)
            if resp.status_code != 200:
                raise UpstreamError(resp.text, provider="dashscope", code=f"UPSTREAM_{resp.status_code}")
            data = resp.json()
            output = data.get("output") or {}
            status = str(output.get("task_status") or output.get("taskStatus") or "").upper()
            if status in {"PENDING", "RUNNING", ""}:
                await _sleep(2.0)
                continue

            results = output.get("results") or []
            urls: list[str] = []
            if isinstance(results, list):
                for item in results:
                    if isinstance(item, dict) and isinstance(item.get("url"), str) and item["url"].strip():
                        urls.append(item["url"].strip())

            if status in {"SUCCEEDED", "PARTIAL_SUCCEEDED"} and urls:
                return {
                    "created": int(time.time()),
                    "data": [{"url": u} for u in urls],
                    "provider_response": data,
                }

            message = data.get("message") or output.get("message") or ""
            code = data.get("code") or output.get("code") or ""
            raise UpstreamError(f"Task failed: {status} {code} {message}".strip(), provider="dashscope")

        raise UpstreamError("Task timed out", provider="dashscope", code="UPSTREAM_TIMEOUT")

    async def video_generation(self, request: VideoGenerationRequest) -> Dict[str, Any]:
        extra = request.extra_body or {}
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "X-DashScope-Async": "enable",
            "Connection": "close",
        }

        request_input: dict[str, Any] = {"prompt": request.prompt}
        if img_url := extra.get("img_url"):
            request_input["img_url"] = img_url
        audio_url = extra.get("audio_url")
        if audio_url:
            request_input["audio_url"] = audio_url
        if ref_videos := extra.get("reference_video_urls"):
            request_input["reference_video_urls"] = ref_videos

        parameters: dict[str, Any] = {"duration": int(request.duration or 5), "watermark": bool(extra.get("watermark", False))}
        if bool(extra.get("prompt_extend", True)):
            parameters["prompt_extend"] = True
        if size := self._normalize_size(extra.get("size")):
            parameters["size"] = size
        if resolution := extra.get("resolution"):
            parameters["resolution"] = resolution

        body = {"model": request.model, "input": request_input, "parameters": parameters}
        url = f"{self.base_url}{self._dashscope_api('/services/aigc/video-generation/video-synthesis')}"

        try:
            timeout = httpx.Timeout(600.0, connect=20.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                # If callers provide audio bytes (e.g. from an upstream node), upload them to DashScope's temporary OSS
                # and pass the resulting oss:// URL. This mirrors the legacy component behavior but keeps credentials server-side.
                if not audio_url:
                    uploaded = await self._maybe_upload_audio(client=client, model=str(request.model), extra=extra)
                    if uploaded:
                        body["input"]["audio_url"] = uploaded

                if _contains_oss_resource(body.get("input")):
                    headers["X-DashScope-OssResourceResolve"] = "enable"

                resp = await client.post(url, headers=headers, json=body)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="dashscope", code=f"UPSTREAM_{resp.status_code}")
                data = resp.json()
                output = data.get("output") or {}
                task_id = output.get("task_id") or output.get("taskId")
                if not task_id:
                    raise UpstreamError(f"Missing task_id in response: {data}", provider="dashscope")
                return {"id": str(task_id), "provider_response": data}
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="dashscope")

    async def video_status(self, video_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}{self._dashscope_api(f'/tasks/{video_id}')}"
        headers = {"Authorization": f"Bearer {self.api_key}", "Connection": "close"}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="dashscope", code=f"UPSTREAM_{resp.status_code}")
                return resp.json()
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="dashscope")

    async def _maybe_upload_audio(self, *, client: httpx.AsyncClient, model: str, extra: dict[str, Any]) -> str | None:
        audio_bytes = extra.get("audio_bytes") or extra.get("audio")
        if not audio_bytes:
            return None

        if isinstance(audio_bytes, str):
            # Allow base64 text payloads.
            try:
                audio_bytes = base64.b64decode(audio_bytes)
            except Exception:
                return None

        if not isinstance(audio_bytes, (bytes, bytearray)) or not audio_bytes:
            return None

        file_name = str(extra.get("audio_file_name") or extra.get("file_name") or "audio.wav")
        file_name = Path(file_name).name or "audio.wav"

        policy = await self._get_upload_policy(client=client, model=model)
        if not policy:
            return None

        upload_dir = str(policy.get("upload_dir") or "").rstrip("/")
        upload_host = str(policy.get("upload_host") or "")
        if not upload_dir or not upload_host:
            return None

        key = f"{upload_dir}/{file_name}"
        files = {
            "OSSAccessKeyId": (None, str(policy.get("oss_access_key_id") or "")),
            "Signature": (None, str(policy.get("signature") or "")),
            "policy": (None, str(policy.get("policy") or "")),
            "x-oss-object-acl": (None, str(policy.get("x_oss_object_acl") or "")),
            "x-oss-forbid-overwrite": (None, str(policy.get("x_oss_forbid_overwrite") or "")),
            "key": (None, key),
            "success_action_status": (None, "200"),
            "file": (file_name, bytes(audio_bytes)),
        }

        for attempt in range(1, 4):
            try:
                resp = await client.post(upload_host, files=files, headers={"Connection": "close"}, timeout=120.0)
                if resp.status_code == 200:
                    return f"oss://{key}"
            except httpx.RequestError:
                if attempt < 3:
                    await _sleep(min(2**attempt, 8))
                    continue
                return None
        return None

    async def _get_upload_policy(self, *, client: httpx.AsyncClient, model: str) -> dict[str, Any] | None:
        url = f"{self.base_url}{self._dashscope_api('/uploads')}"
        for attempt in range(1, 4):
            try:
                resp = await client.get(
                    url,
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "Connection": "close"},
                    params={"action": "getPolicy", "model": model},
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="dashscope", code=f"UPSTREAM_{resp.status_code}")
                data = resp.json()
                policy = (data or {}).get("data")
                return policy if isinstance(policy, dict) else None
            except (httpx.RequestError, UpstreamError):
                if attempt < 3:
                    await _sleep(min(2**attempt, 8))
                    continue
                return None
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


async def _sleep(seconds: float) -> None:
    # local helper to avoid importing asyncio at module import time for sync callers
    import asyncio

    await asyncio.sleep(seconds)

