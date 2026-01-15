from __future__ import annotations

import base64
from typing import Any, Dict
from urllib.parse import urlencode

import httpx

from langflow.gateway.errors import UpstreamError
from langflow.gateway.providers.base import ProviderAdapter
from langflow.gateway.schemas import VideoGenerationRequest


class SoraProvider(ProviderAdapter):
    """Adapter for Sora video via domestic proxy (OpenAI-ish)."""

    def __init__(self, api_key: str, base_url: str | None = None):
        super().__init__(api_key, base_url)
        import os

        self.base_url = (base_url or os.getenv("SORA_API_BASE") or "https://cdn.12ai.org").rstrip("/")

    async def video_generation(self, request: VideoGenerationRequest) -> Dict[str, Any]:
        extra = request.extra_body or {}
        query: dict[str, str] = {}
        group = str(extra.get("group") or "").strip()
        distributor = str(extra.get("distributor") or "").strip()
        if group:
            query["group"] = group
        if distributor:
            query["distributor"] = distributor
        query_suffix = f"?{urlencode(query)}" if query else ""

        url = f"{self.base_url}/v1/videos{query_suffix}"
        headers: dict[str, str] = {"Authorization": f"Bearer {self.api_key}"}

        payload: dict[str, Any] = {
            "model": request.model,
            "prompt": request.prompt,
            "seconds": str(request.duration or 5),
            "size": extra.get("size") or extra.get("ratio") or request.ratio or "1280x720",
        }

        # Optional reference image (input_reference).
        files = None
        input_reference = extra.get("input_reference")
        if isinstance(input_reference, str) and input_reference.startswith("data:image/") and "," in input_reference:
            try:
                header, b64 = input_reference.split(",", 1)
                mime_type = header.split(":")[1].split(";")[0]
                image_bytes = base64.b64decode(b64)
                files = {"input_reference": ("reference.jpg", image_bytes, mime_type)}
            except Exception:
                files = None

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                if files:
                    resp = await client.post(url, headers=headers, data=payload, files=files)
                else:
                    resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="sora", code=f"UPSTREAM_{resp.status_code}")
                create_result = resp.json()

            task_id = create_result.get("id")
            if not task_id:
                raise UpstreamError(f"Missing id in response: {create_result}", provider="sora")

            # Encode query context into the raw id for later polling.
            raw_id = str(task_id)
            if query:
                raw_id = f"{raw_id}|{urlencode(query)}"
            return {"id": raw_id, "provider_response": create_result}
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="sora")

    async def video_status(self, video_id: str) -> Dict[str, Any]:
        raw_id = video_id
        query_suffix = ""
        if "|" in raw_id:
            raw_id, query = raw_id.split("|", 1)
            query_suffix = f"?{query}" if query else ""

        url = f"{self.base_url}/v1/videos/{raw_id}{query_suffix}"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="sora", code=f"UPSTREAM_{resp.status_code}")
                return resp.json()
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="sora")

