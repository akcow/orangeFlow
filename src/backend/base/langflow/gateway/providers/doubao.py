import json
import time
from typing import Any, Dict

import httpx

from langflow.gateway.errors import UpstreamError
from langflow.gateway.providers.base import ProviderAdapter
from langflow.gateway.schemas import ImageGenerationRequest, VideoGenerationRequest


class DoubaoProvider(ProviderAdapter):
    """Adapter for Doubao (Ark) models (Image, Video)."""

    def __init__(self, api_key: str, base_url: str | None = None):
        super().__init__(api_key, base_url)
        # Default to official Ark endpoint if not provided
        import os

        self.base_url = (base_url or os.getenv("ARK_API_BASE") or "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")

    async def image_generation(self, request: ImageGenerationRequest) -> Dict[str, Any]:
        url = f"{self.base_url}/images/generations"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        # Map fields to Ark API
        payload: dict[str, Any] = {
            "model": request.model,
            "prompt": request.prompt,
            "size": request.size,
            "n": request.n,
            "response_format": request.response_format,
        }
        # Allow provider-specific passthrough fields (e.g. sequential options, reference images).
        if isinstance(request.extra_body, dict) and request.extra_body:
            payload.update(request.extra_body)

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                
                if response.status_code != 200:
                    self._handle_error(response)
                    
                return response.json()

        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="doubao")

    async def video_generation(self, request: VideoGenerationRequest) -> Dict[str, Any]:
        """
        Creates a video generation task.
        Note: Ark content generation uses /contents/generations/tasks
        """
        url = f"{self.base_url}/contents/generations/tasks"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # Construct specific payload for Doubao Video
        # Based on component analysis, params are largely packed into prompt or specific fields
        # Gateway architecture prefers standardizing, but here we adapt.
        
        # Simplified param packing as seen in component (optional but helpful for some models)
        # However, new Ark API might support structured fields. 
        # For now, we follow the standard Create Task structure if possible.
        
        content_item = {
            "type": "text", 
            "text": request.prompt
        }
        
        # Append params to text if needed (legacy/specific model support)
        # For MVP, we pass ratio/duration if the model supports it via explicit params 
        # or rely on the router to have picked the right model.
        # But `DoubaoVideoGenerator` appends them to text. Let's do similar if safe.
        # text_params = f"{request.prompt} --ratio {request.ratio} --dur {request.duration}"
        # content_item["text"] = text_params
        # Let's clean this up: The adapter should probably send structured data if the API supports it.
        # Ark API spec for video usually expects `content` list.

        payload: dict[str, Any] = {
            "model": request.model,
            "content": [content_item]
        }
        if isinstance(request.extra_body, dict) and request.extra_body:
            # Ark's content_generation API supports a rich shape; allow passthrough.
            payload.update(request.extra_body)
        
        # Pass extra body (for unique params like ratio/duration if Ark supports sending them outside text)
        # Actually Ark `content_generation` API is complex.
        # To match the component exactly:
        params_str = f"{request.prompt}"
        if request.ratio:
            params_str += f" --ratio {request.ratio}"
        if request.duration:
            params_str += f" --dur {request.duration}"
            
        content_item["text"] = params_str

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                
                if response.status_code != 200:
                    self._handle_error(response)
                
                data = response.json()
                # Return standard ID structure
                return {"id": data.get("id"), "provider_response": data}

        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="doubao")

    async def video_status(self, video_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/contents/generations/tasks/{video_id}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=headers)
                
                if response.status_code != 200:
                    self._handle_error(response)
                
                return response.json()

        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="doubao")

    def _handle_error(self, response: httpx.Response):
        try:
            error_data = response.json()
            message = error_data.get("error", {}).get("message", str(response.text))
        except Exception:
            message = response.text
        
        msg = (str(message or "")).strip()
        if not msg:
            body = (response.text or "").strip()
            msg = f"上游服务返回 HTTP {response.status_code}" + (f": {body[:500]}" if body else "（响应为空）")
        
        raise UpstreamError(
            message=msg,
            provider="doubao",
            code=f"UPSTREAM_{response.status_code}"
        )
