from typing import Any, AsyncGenerator, Dict

from langflow.gateway.schemas import (
    ChatCompletionRequest,
    ImageGenerationRequest,
    VideoGenerationRequest,
    AudioSpeechRequest,
)


class ProviderAdapter:
    """Abstract base class for model provider adapters."""

    def __init__(self, api_key: str, base_url: str | None = None):
        self.api_key = api_key
        self.base_url = base_url


    async def chat_completion(self, request: ChatCompletionRequest) -> Dict[str, Any] | AsyncGenerator[str, None]:
        """Handle chat completion request."""
        raise NotImplementedError("Chat completion not supported by this provider")

    async def image_generation(self, request: ImageGenerationRequest) -> Dict[str, Any]:
        """Handle image generation request."""
        raise NotImplementedError("Image generation not supported by this provider")

    async def video_generation(self, request: VideoGenerationRequest) -> Dict[str, Any]:
        """Handle video generation request (create task)."""
        raise NotImplementedError("Video generation not supported by this provider")
    
    async def video_status(self, video_id: str) -> Dict[str, Any]:
        """Handle video status polling."""
        raise NotImplementedError("Video status polling not supported by this provider")

    async def audio_speech(self, request: AudioSpeechRequest) -> bytes:
        """Handle text-to-speech request."""
        raise NotImplementedError("Audio speech not supported by this provider")
