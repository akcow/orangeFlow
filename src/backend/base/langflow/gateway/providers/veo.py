from __future__ import annotations

from typing import Any, Dict

import httpx

from langflow.gateway.errors import UpstreamError
from langflow.gateway.providers.base import ProviderAdapter
from langflow.gateway.schemas import VideoGenerationRequest


class VeoProvider(ProviderAdapter):
    """Adapter for Veo video via domestic proxy."""

    def __init__(self, api_key: str, base_url: str | None = None):
        super().__init__(api_key, base_url)
        import os

        self.base_url = (base_url or os.getenv("VEO_API_BASE") or "https://new.12ai.org").rstrip("/")

    async def video_generation(self, request: VideoGenerationRequest) -> Dict[str, Any]:
        url = f"{self.base_url}/v1/videos"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        # Let callers pass an already-validated VEO payload in extra_body.
        payload = request.extra_body.get("veo_payload") if isinstance(request.extra_body, dict) else None
        if not isinstance(payload, dict):
            payload = {
                "model": request.model,
                "prompt": request.prompt,
            }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="veo", code=f"UPSTREAM_{resp.status_code}")
                create_result = resp.json()

            if "error" in create_result:
                raise UpstreamError(f"Upstream error: {create_result['error']}", provider="veo")

            task_id = create_result.get("task_id")
            if not task_id:
                raise UpstreamError(f"Missing task_id in response: {create_result}", provider="veo")

            return {"id": str(task_id), "provider_response": create_result}
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="veo")

    async def video_status(self, video_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/v1/videos/{video_id}"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="veo", code=f"UPSTREAM_{resp.status_code}")
                return resp.json()
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="veo")

