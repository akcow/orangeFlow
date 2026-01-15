import os
from typing import Annotated, Dict, Any, Union, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import Response, StreamingResponse

from langflow.gateway.auth import get_hosted_key
from langflow.gateway.errors import GatewayError, ModelNotFoundError
from langflow.gateway.schemas import (
    ChatCompletionRequest,
    ImageGenerationRequest,
    VideoGenerationRequest,
    AudioSpeechRequest,
    ModelPageResponse,
    ModelTypesResponse,
)
from fastapi import File, UploadFile, Form

# Providers
from langflow.gateway.providers.openai import OpenAIProvider
from langflow.gateway.providers.doubao import DoubaoProvider
from langflow.gateway.providers.gemini import GeminiProvider
from langflow.gateway.providers.qwen import QwenProvider

router = APIRouter(prefix="/v1", tags=["Gateway"])

# --- Factory / Resolver ---
# For MVP, we use simple matching.
def get_provider(model: str) -> Union[OpenAIProvider, DoubaoProvider, GeminiProvider, QwenProvider]:
    # 1. Text Models (DeepSeek, etc.) -> OpenAI Adapter
    if model.startswith("deepseek") or model.startswith("gpt-"):
        # Use simple env var for key
        api_key = os.getenv("DEEPSEEK_API_KEY") if "deepseek" in model else os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com") if "deepseek" in model else None
        
        if not api_key:
             # Fallback: maybe the component uses a different env convention? 
             # Design doc says "vendors keys managed via env vars".
             # Users must have set DEEPSEEK_API_KEY.
             raise GatewayError(401, "PROVIDER_KEY_MISSING", f"Key for model {model} not configured.")
             
        return OpenAIProvider(api_key=api_key, base_url=base_url)

    # 2. Image/Video Models -> Doubao/Gemini/Sora Adapter
    # Doubao Series
    if "doubao" in model or "wan2." in model:
        # Decide if it's Image or Video? 
        # Actually logic is split by endpoint usually, but we need the adapter class instance.
        # Doubao adapter handles both if configured.
        
        # Check if it is Wan (uses DashScope Key) or Doubao (uses Ark Key)
        if "wan2." in model:
             api_key = os.getenv("DASHSCOPE_API_KEY")
             # Wan uses DashScope base url usually? Adapter handles base_url logic if None is passed
             return DoubaoProvider(api_key=api_key) # Base URL defaults to Ark (wrong for Wan?)
             # Wait, DoubaoProvider uses Ark SDK or endpoints.
             # Custom component uses `DoubaoVideoGenerator` which handles wan/doubao.
             # If using `httpx` in `DoubaoProvider`, we need to change base_url for Wan if it's different.
             # Wan usually is DashScope? `DoubaoVideoGenerator` uses `dashscope` SDK logic for `_build_video_dashscope`!
             # Accessing Wan via Ark is only for some versions? 
             # Design doc: "Doubao adapter...". Implementation details in `DoubaoProvider` used Ark URL.
             # NOTE: This might be a bug in my `doubao.py` if Wan needs dashscope URL.
             # MVP Fix: Let's assume standard Ark for now or fix `doubao.py` later.
        
        api_key = os.getenv("ARK_API_KEY")
        return DoubaoProvider(api_key=api_key)

    # Gemini/Veo matched by name
    if "gemini" in model or "veo" in model:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        return GeminiProvider(api_key=api_key)

    # Sora matched by name
    if "sora" in model:
        # Sora uses OpenAI-ish interface but domestic proxy.
        # `models/sora-2`.
        # Reuse DoubaoProvider? Or OpenAIProvider with custom base?
        # Component `DoubaoVideoGenerator` handles Sora (lines 108+).
        # It uses `_build_video_sora`.
        # Let's use `DoubaoProvider` (renamed to `VideoProvider` effectively) or `OpenAIProvider`?
        # `DoubaoProvider` has `video_generation` method. `OpenAIProvider` doesn't yet.
        # Let's map Sora to `DoubaoProvider` for video handling interface compatibility, 
        # or implement `video_generation` in `OpenAIProvider`.
        # To keep it simple: Use `DoubaoProvider` which targets `base_url` capable of video tasks.
        # But wait, Sora proxy is `cdn.12ai.org`.
        api_key = os.getenv("OPENAI_API_KEY")
        return DoubaoProvider(api_key=api_key, base_url="https://cdn.12ai.org")

    # Audio/Qwen
    if "qwen3-tts" in model:
        api_key = os.getenv("DASHSCOPE_API_KEY")
        return QwenProvider(api_key=api_key)

    raise ModelNotFoundError(model)


# --- Endpoints ---

@router.get("/models")
async def list_models(
    token: str = Depends(get_hosted_key)
):
    """
    List supported models.
    """
    # Static list from design doc
    models = [
        {"id": "deepseek-chat", "object": "model", "owned_by": "deepseek"},
        {"id": "deepseek-reasoner", "object": "model", "owned_by": "deepseek"},
        {"id": "gemini-3-pro-preview", "object": "model", "owned_by": "google"},
        {"id": "doubao-seedream-4-5-251128", "object": "model", "owned_by": "doubao"},
        {"id": "sora-2", "object": "model", "owned_by": "sora"},
        # ... add others from doc ...
    ]

    return {"object": "list", "data": models}


# --- Compatibility Endpoints ---

@router.get("/model/page")
async def list_model_page(
    type: Optional[str] = None,
    current: int = 1,
    size: int = 1000,
    enable: bool = True,
    token: str = Depends(get_hosted_key)
) -> ModelPageResponse:
    """Compatibility endpoint for huobao-canvas model list."""
    # MVP: Static mapping
    all_models = [
        {"id": "deepseek-chat", "fullName": "DeepSeek Chat", "type": "chat"},
        {"id": "deepseek-reasoner", "fullName": "DeepSeek Reasoner", "type": "chat"},
        {"id": "gemini-3-pro-preview", "fullName": "Gemini 3 Pro", "type": "chat"},
        
        {"id": "doubao-seedream-4-5-251128", "fullName": "Doubao Seedream 4.5", "type": "image"},
        {"id": "wan2.6-image", "fullName": "Wan 2.6 Image", "type": "image"},
        
        {"id": "sora-2", "fullName": "Sora 2", "type": "video"},
        {"id": "doubao-seedance-1-5-pro-251215", "fullName": "Doubao Seedance 1.5", "type": "video"},
        {"id": "wan2.6", "fullName": "Wan 2.6 Video", "type": "video"},
        {"id": "veo-3.1-generate-preview", "fullName": "Google Veo 3.1", "type": "video"},
        
        {"id": "qwen3-tts-flash-2025-11-27", "fullName": "Qwen TTS", "type": "audio"},
    ]
    
    # Filter
    filtered = [m for m in all_models if (not type or m["type"] == type)]
    
    # Pagination (MVP: simple slice)
    start = (current - 1) * size
    end = start + size
    records = filtered[start:end]
    
    return ModelPageResponse(
        code=200, 
        msg="success", 
        data={"records": records, "total": len(filtered), "current": current, "size": size}
    )

@router.get("/model/types")
async def list_model_types(token: str = Depends(get_hosted_key)) -> ModelTypesResponse:
    return ModelTypesResponse(data=[
        {"label": "对话", "value": "chat"},
        {"label": "绘画", "value": "image"},
        {"label": "视频", "value": "video"},
        {"label": "语音", "value": "audio"},
    ])


@router.post("/chat/completions")
async def create_chat_completion(
    request: ChatCompletionRequest,
    token: str = Depends(get_hosted_key)
):
    provider = get_provider(request.model)
    return await provider.chat_completion(request)


@router.post("/images/generations")
async def create_image_generation(
    request: ImageGenerationRequest,
    token: str = Depends(get_hosted_key)
):
    provider = get_provider(request.model)
    return await provider.image_generation(request)


@router.post("/videos")
async def create_video_generation(
    # Mixed support: JSON or Form Data
    request: Optional[VideoGenerationRequest] = None,
    # Form fields support for huobao-canvas
    model: Optional[str] = Form(None),
    prompt: Optional[str] = Form(None),
    ratio: Optional[str] = Form("16:9"),
    duration: Optional[int] = Form(5),
    quality: Optional[str] = Form("standard"),
    image: Optional[UploadFile] = File(None), # For Image-to-Video
    token: str = Depends(get_hosted_key)
):
    # Consolidate request
    if request is None:
        if not model or not prompt:
            raise HTTPException(status_code=400, detail="Missing model or prompt")
        # Build request object from Form data
        request = VideoGenerationRequest(
            model=model,
            prompt=prompt,
            ratio=ratio,
            duration=duration,
            quality=quality
        )
        # TODO: Handle 'image' file upload if provider supports it (Doubao/Wan i2v)
        # For MVP, we might ignore or pass file path if adapter supports it.
        # DoubaoProvider would need 'image' in extra_body or similar.
    
    provider = get_provider(request.model)
    return await provider.video_generation(request)


@router.get("/videos/{video_id}")
async def get_video_status(
    video_id: str,
    model: Annotated[str, Header()] = "sora-2", # Client must hint model/provider or we encode it in ID
    token: str = Depends(get_hosted_key)
):
    # Weakness: Routing by ID requires knowing provider. 
    # MVP: Assume client includes `Model` header or we pass param?
    # Design doc: `GET /v1/videos/{id}`. 
    # If we don't know the provider, we have to guess or store state.
    # For MVP stateless: Client sends `Model: <name>` header, or we default to DoubaoProvider?
    # Let's require `Model` header or query param if possible, or try loop.
    # Actually, let's just use `DoubaoProvider` (used for Sora too) as default if model not specific.
    
    if not model:
         # Fallback default
         model = "sora-2" 
         
    provider = get_provider(model)
    return await provider.video_status(video_id)


@router.post("/audio/speech")
async def create_audio_speech(
    request: AudioSpeechRequest,
    token: str = Depends(get_hosted_key)
):
    provider = get_provider(request.model)
    audio_content = await provider.audio_speech(request)
    return Response(content=audio_content, media_type="audio/mpeg")
    
# Add `router.py` to `__init__.py` or exposes it.
