from __future__ import annotations

from typing import Any, Dict

import httpx

from langflow.gateway.errors import UpstreamError
from langflow.gateway.providers.base import ProviderAdapter
from langflow.gateway.schemas import VideoGenerationRequest


class KlingProvider(ProviderAdapter):
    """Adapter for Kling Omni-Video (kling-video-o1)."""

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
