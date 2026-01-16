import json
from typing import Any, Dict

import httpx

from langflow.gateway.errors import UpstreamError
from langflow.gateway.providers.base import ProviderAdapter
from langflow.gateway.schemas import AudioSpeechRequest


class QwenProvider(ProviderAdapter):
    """Adapter for Qwen TTS (DashScope)."""

    def __init__(self, api_key: str, base_url: str | None = None):
        super().__init__(api_key, base_url)
        import os

        resolved = base_url or os.getenv("DASHSCOPE_TTS_API_BASE") or os.getenv("DASHSCOPE_API_BASE")
        if resolved:
            normalized = resolved.rstrip("/")
            if not normalized.endswith("/api/v1"):
                normalized = f"{normalized}/api/v1"
            self.base_url = normalized
        else:
            self.base_url = "https://dashscope.aliyuncs.com/api/v1"

    async def audio_speech(self, request: AudioSpeechRequest) -> bytes:
        # Adapt OpenAI /v1/audio/speech to DashScope MultiModal or TTS
        # DashScope OpenAI-compat API: https://dashscope.aliyuncs.com/compatible-mode/v1/audio/speech ? 
        # Unsure if valid. Let's use the native DashScope REST API structure for MultiModal as seen in component but via HTTP.
        # Component uses: MultiModalConversation.call(model=..., text=..., voice=...)
        # Native URL: /services/aigc/multimodal-generation/generation ?
        # Or /services/aigc/text-generation/generation ?
        
        # For MVP, let's assume standard DashScope HTTP endpoint for MultiModal is:
        # POST /services/aigc/multimodal-generation/generation
        url = f"{self.base_url}/services/aigc/multimodal-generation/generation"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-DashScope-WorkSpace": "enable", # Optional
        }

        # Construct MultiModal payload
        payload = {
            "model": request.model,
            "input": {
                "messages": [
                    {
                        "role": "user",
                        "content": [{"text": request.input}]
                    }
                ]
            },
            "parameters": {
                "voice": request.voice,
                # "sample_rate": 24000, 
                "format": request.response_format # mp3/wav
            }
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                
                if response.status_code != 200:
                    self._handle_error(response)
                
                data = response.json()
                # DashScope returns audio_url usually
                try:
                    audio_url = data["output"]["choices"][0]["message"]["content"][0]["audio_url"]
                except (KeyError, IndexError):
                     try:
                         # Try older/other format
                         audio_url = data["output"]["audio_url"]
                     except KeyError:
                         raise UpstreamError("No audio_url in upstream response", provider="qwen")
                
                # Fetch the audio content
                audio_resp = await client.get(audio_url)
                if audio_resp.status_code != 200:
                     raise UpstreamError("Failed to download audio from upstream", provider="qwen")
                
                return audio_resp.content

        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="qwen")

    def _handle_error(self, response: httpx.Response):
        try:
            error_data = response.json()
            message = error_data.get("message", str(response.text))
        except Exception:
            message = response.text

        msg = (str(message or "")).strip()
        if not msg:
            body = (response.text or "").strip()
            msg = f"上游服务返回 HTTP {response.status_code}" + (f": {body[:500]}" if body else "（响应为空）")
        
        raise UpstreamError(
             message=msg,
             provider="qwen",
             code=f"UPSTREAM_{response.status_code}"
        )
