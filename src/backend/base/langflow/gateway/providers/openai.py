import json
from typing import Any, AsyncGenerator, Dict

import httpx

from langflow.gateway.errors import UpstreamError
from langflow.gateway.providers.base import ProviderAdapter
from langflow.gateway.schemas import ChatCompletionRequest


class OpenAIProvider(ProviderAdapter):
    """Adapter for OpenAI-compatible providers (OpenAI, DeepSeek, Moonshot, etc.)."""

    async def chat_completion(self, request: ChatCompletionRequest) -> Dict[str, Any] | AsyncGenerator[str, None]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        # Prepare payload
        payload = request.model_dump(exclude_none=True)
        
        # Handle specific adjustments if needed (e.g. DeepSeek specific params)
        # For now, pass through standard OpenAI params.

        url = f"{self.base_url}/chat/completions"

        try:
            client = httpx.AsyncClient(timeout=60.0)
            
            if request.stream:
                return self._stream_chat(client, url, headers, payload)
            else:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code != 200:
                    await client.aclose()
                    self._handle_error(response)
                
                await client.aclose()
                return response.json()

        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="openai")

    async def _stream_chat(
        self, client: httpx.AsyncClient, url: str, headers: Dict[str, str], payload: Dict[str, Any]
    ) -> AsyncGenerator[str, None]:
        """Yields SSE events."""
        try:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    # Capture error body
                    await response.aread() 
                    self._handle_error(response)

                async for line in response.aiter_lines():
                    if line:
                        yield line
        except httpx.RequestError as exc:
             # In stream, we might break early
             yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            await client.aclose()

    def _handle_error(self, response: httpx.Response):
        try:
            error_data = response.json()
            message = error_data.get("error", {}).get("message", str(response.text))
        except Exception:
            message = response.text
        
        raise UpstreamError(
            message=message,
            provider="openai",
            code=f"UPSTREAM_{response.status_code}"
        )
