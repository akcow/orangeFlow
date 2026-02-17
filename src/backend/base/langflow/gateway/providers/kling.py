from __future__ import annotations

import asyncio
import time
from typing import Any, Dict

import httpx

from langflow.gateway.errors import UpstreamError
from langflow.gateway.providers.base import ProviderAdapter
from langflow.gateway.schemas import ImageGenerationRequest, VideoGenerationRequest


class KlingProvider(ProviderAdapter):
    """Adapter for Kling Omni (video + image).

    - Video: /v1/videos/omni-video
    - Image: /v1/images/omni-image
    """

    def __init__(self, api_key: str, base_url: str | None = None):
        super().__init__(api_key, base_url)
        import os

        # Official base: https://api-beijing.klingai.com
        self.base_url = (base_url or os.getenv("KLING_API_BASE") or "https://api-beijing.klingai.com").rstrip("/")

    @staticmethod
    def _map_quality_to_mode(value: Any | None) -> str:
        v = str(value or "").strip().lower()
        if v in {"std", "standard"}:
            return "std"
        if v in {"pro", "high", "hd", "quality"}:
            return "pro"
        return "pro"

    async def image_generation(self, request: ImageGenerationRequest) -> Dict[str, Any]:
        """
        Create a Kling omni-image task, then poll until completion.

        We accept either:
        - `extra_body.kling_payload`: a full upstream payload dict; or
        - standard gateway fields + passthrough keys in `extra_body`.
        """
        create_url = f"{self.base_url}/v1/images/omni-image"
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

        extra = request.extra_body if isinstance(request.extra_body, dict) else {}
        payload = extra.get("kling_payload") if isinstance(extra, dict) else None

        if not isinstance(payload, dict):
            payload = {
                "model_name": str(extra.get("model_name") or request.model or "kling-image-o1"),
                "prompt": request.prompt,
                "n": int(extra.get("n") or request.n or 1),
            }
            # Map common gateway knobs to Kling fields.
            if "aspect_ratio" in extra:
                payload["aspect_ratio"] = extra["aspect_ratio"]
            if "resolution" in extra:
                payload["resolution"] = extra["resolution"]

            # Passthrough official fields when present.
            for key in ("image_list", "element_list", "callback_url", "external_task_id"):
                if key in extra:
                    payload[key] = extra[key]

        payload.setdefault("model_name", "kling-image-o1")
        payload.setdefault("prompt", request.prompt)

        # Create task.
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(create_url, headers=headers, json=payload)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="kling", code=f"UPSTREAM_{resp.status_code}")
                create_result = resp.json()
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="kling")

        if isinstance(create_result, dict) and create_result.get("code") not in (None, 0, "0"):
            raise UpstreamError(
                f"{create_result.get('message') or 'Upstream returned error'}: {create_result}",
                provider="kling",
            )

        data = create_result.get("data") if isinstance(create_result, dict) else None
        task_id = data.get("task_id") if isinstance(data, dict) else None
        if not task_id:
            raise UpstreamError(f"Missing task_id in response: {create_result}", provider="kling")

        # Poll status.
        status_url = f"{self.base_url}/v1/images/omni-image/{task_id}"
        timeout_s = int(extra.get("timeout_s") or 600)
        poll_interval_s = float(extra.get("poll_interval_s") or 2.0)
        deadline = time.time() + max(5, timeout_s)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                while time.time() < deadline:
                    resp = await client.get(status_url, headers={"Authorization": f"Bearer {self.api_key}"})
                    if resp.status_code != 200:
                        raise UpstreamError(resp.text, provider="kling", code=f"UPSTREAM_{resp.status_code}")
                    result = resp.json()

                    if isinstance(result, dict) and result.get("code") not in (None, 0, "0"):
                        raise UpstreamError(
                            f"{result.get('message') or 'Upstream returned error'}: {result}",
                            provider="kling",
                        )

                    data = result.get("data") if isinstance(result, dict) else None
                    status = (data.get("task_status") if isinstance(data, dict) else None) or ""
                    status = str(status).strip().lower()

                    if status in {"submitted", "processing", ""}:
                        await asyncio.sleep(poll_interval_s)
                        continue

                    if status == "succeed":
                        task_result = data.get("task_result") if isinstance(data, dict) else None
                        result_type = task_result.get("result_type") if isinstance(task_result, dict) else None
                        images = task_result.get("images") if isinstance(task_result, dict) else None
                        series_images = task_result.get("series_images") if isinstance(task_result, dict) else None

                        # Doc: single -> images; series -> series_images. Some upstream variants may include both.
                        preferred: Any = None
                        if str(result_type or "").strip().lower() == "series":
                            preferred = series_images if isinstance(series_images, list) else images
                        else:
                            preferred = images if isinstance(images, list) else series_images

                        urls: list[str] = []
                        if isinstance(preferred, list):
                            for item in preferred:
                                if isinstance(item, dict) and isinstance(item.get("url"), str) and item["url"].strip():
                                    urls.append(item["url"].strip())
                        # Fallback: if preferred list is empty but the other one exists, try it too.
                        if not urls:
                            other = images if preferred is series_images else series_images
                            if isinstance(other, list):
                                for item in other:
                                    if (
                                        isinstance(item, dict)
                                        and isinstance(item.get("url"), str)
                                        and item["url"].strip()
                                    ):
                                        urls.append(item["url"].strip())
                        if not urls:
                            raise UpstreamError(f"No image urls in response: {result}", provider="kling")
                        return {
                            "created": int(time.time()),
                            "data": [{"url": u} for u in urls],
                            "provider_response": result,
                        }

                    if status == "failed":
                        msg = ""
                        if isinstance(data, dict):
                            msg = str(data.get("task_status_msg") or data.get("message") or "").strip()
                        raise UpstreamError(f"Task failed: {msg}".strip(), provider="kling")

                    # Unknown status: keep polling a bit.
                    await asyncio.sleep(poll_interval_s)

        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="kling")

        raise UpstreamError(f"Task timed out: {task_id}", provider="kling", code="UPSTREAM_TIMEOUT")

    async def video_generation(self, request: VideoGenerationRequest) -> Dict[str, Any]:
        """
        Create a Kling omni-video task.

        We accept either:
        - `extra_body.kling_payload`: a full upstream payload dict; or
        - standard gateway fields + passthrough keys in `extra_body`.
        """
        url = f"{self.base_url}/v1/videos/omni-video"
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

        extra = request.extra_body if isinstance(request.extra_body, dict) else {}
        payload = extra.get("kling_payload") if isinstance(extra, dict) else None

        if not isinstance(payload, dict):
            # Build a best-effort payload from normalized gateway fields.
            payload = {
                "model_name": str(extra.get("model_name") or request.model or "kling-video-o1"),
                "prompt": request.prompt,
            }

            # Map common gateway knobs to Kling fields.
            if request.ratio:
                payload["aspect_ratio"] = str(extra.get("aspect_ratio") or request.ratio)
            if request.duration:
                payload["duration"] = str(extra.get("duration") or request.duration)

            payload["mode"] = str(extra.get("mode") or self._map_quality_to_mode(request.quality))

            # Passthrough official fields when present.
            for key in (
                "image_list",
                "video_list",
                "element_list",
                "callback_url",
                "external_task_id",
                "seed",
                "negative_prompt",
            ):
                if key in extra:
                    payload[key] = extra[key]

        # Ensure required fields.
        payload.setdefault("model_name", "kling-video-o1")
        payload.setdefault("prompt", request.prompt)

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="kling", code=f"UPSTREAM_{resp.status_code}")
                create_result = resp.json()

            if isinstance(create_result, dict) and create_result.get("code") not in (None, 0, "0"):
                raise UpstreamError(
                    f"{create_result.get('message') or 'Upstream returned error'}: {create_result}",
                    provider="kling",
                )

            data = create_result.get("data") if isinstance(create_result, dict) else None
            task_id = data.get("task_id") if isinstance(data, dict) else None
            if not task_id:
                raise UpstreamError(f"Missing task_id in response: {create_result}", provider="kling")

            return {"id": str(task_id), "provider_response": create_result}
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="kling")

    async def video_status(self, video_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/v1/videos/omni-video/{video_id}"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="kling", code=f"UPSTREAM_{resp.status_code}")
                result = resp.json()

            if isinstance(result, dict) and result.get("code") not in (None, 0, "0"):
                raise UpstreamError(
                    f"{result.get('message') or 'Upstream returned error'}: {result}",
                    provider="kling",
                )
            return result
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="kling")
