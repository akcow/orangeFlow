import os
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import Response, StreamingResponse

from langflow.gateway.auth import get_hosted_key
from langflow.gateway.errors import GatewayError, ModelNotFoundError
from langflow.gateway.kling_auth import resolve_kling_bearer_token
from langflow.gateway.task_ids import decode_task_id, encode_task_id
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
from langflow.gateway.providers.dashscope import DashScopeProvider
from langflow.gateway.providers.sora import SoraProvider
from langflow.gateway.providers.veo import VeoProvider
from langflow.gateway.providers.qwen import QwenProvider
from langflow.gateway.providers.kling import KlingProvider
from langflow.gateway.providers.vidu import ViduProvider
from langflow.gateway.providers.jimeng_visual import JimengVisualProvider

router = APIRouter(prefix="/v1", tags=["Gateway"])

def _normalize_key(value: str | None) -> str | None:
    if not value:
        return None
    v = str(value).strip().strip("'").strip('"')
    if not v:
        return None
    if v.lower().startswith("bearer "):
        v = v.split(" ", 1)[1].strip()
    # Never accept masked secrets persisted from UI.
    if v.startswith("****"):
        return None
    # Keys should not contain whitespace.
    v = "".join(v.split())
    return v or None


def _load_provider_credentials_key(*, providers: list[str]) -> str | None:
    """Read api_key from provider_credentials.json (if present)."""
    try:  # pragma: no cover - runtime dependency
        from langflow.services.deps import get_settings_service
        from lfx.utils.provider_credentials import get_provider_credentials

        settings_service = get_settings_service()
        config_dir = settings_service.settings.config_dir
        for provider in providers:
            creds = get_provider_credentials(provider, config_dir)
            key = _normalize_key(creds.api_key)
            if key:
                return key
    except Exception:
        return None
    return None


def _resolve_api_key(
    *,
    env_vars: list[str],
    provider_cred_keys: list[str],
) -> str | None:
    for env_var in env_vars:
        key = _normalize_key(os.getenv(env_var))
        if key:
            return key

    key = _load_provider_credentials_key(providers=provider_cred_keys)
    if key:
        return key

    return None


def resolve_provider(model: str) -> tuple[str, Any]:
    """Return (provider_name, provider_instance) for a given model id."""
    model = (model or "").strip()
    if not model:
        raise ModelNotFoundError(model)

    # Text models: OpenAI-compatible (OpenAI/DeepSeek).
    if model.startswith("deepseek"):
        api_key = _resolve_api_key(
            env_vars=["DEEPSEEK_API_KEY"],
            provider_cred_keys=["deepseek"],
        )
        base_url = os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1")
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                f"Key for model {model} not configured. Set DEEPSEEK_API_KEY, or save provider credentials 'deepseek'.",
            )
        return "openai", OpenAIProvider(api_key=api_key, base_url=base_url)

    if model.startswith("gpt-"):
        api_key = _resolve_api_key(
            env_vars=["OPENAI_API_KEY"],
            provider_cred_keys=["openai"],
        )
        base_url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                f"Key for model {model} not configured. Set OPENAI_API_KEY, or save provider credentials 'openai'.",
            )
        return "openai", OpenAIProvider(api_key=api_key, base_url=base_url)

    # Wan (DashScope) models.
    if model.startswith("wan2."):
        api_key = _resolve_api_key(
            env_vars=["DASHSCOPE_API_KEY"],
            provider_cred_keys=["dashscope", "qwen_tts", "dashscope_tts"],
        )
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                f"Key for model {model} not configured. Set DASHSCOPE_API_KEY, or save provider credentials 'dashscope'.",
            )
        return "dashscope", DashScopeProvider(api_key=api_key)

    # Wanx (DashScope) image-edit models (e.g. wanx2.1-imageedit).
    if model.startswith("wanx"):
        api_key = _resolve_api_key(
            env_vars=["DASHSCOPE_API_KEY"],
            provider_cred_keys=["dashscope", "qwen_tts", "dashscope_tts"],
        )
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                f"Key for model {model} not configured. Set DASHSCOPE_API_KEY, or save provider credentials 'dashscope'.",
            )
        return "dashscope", DashScopeProvider(api_key=api_key)

    # Qwen image edit models (DashScope multimodal-generation).
    if model.startswith("qwen-image-edit"):
        api_key = _resolve_api_key(
            env_vars=["DASHSCOPE_API_KEY"],
            provider_cred_keys=["dashscope", "qwen_tts", "dashscope_tts"],
        )
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                f"Key for model {model} not configured. Set DASHSCOPE_API_KEY, or save provider credentials 'dashscope'.",
            )
        return "dashscope", DashScopeProvider(api_key=api_key)

    # Doubao (Ark) models.
    if model.startswith("doubao"):
        api_key = _resolve_api_key(
            env_vars=["ARK_API_KEY"],
            provider_cred_keys=["doubao", "model_provider"],
        )
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                f"Key for model {model} not configured. Set ARK_API_KEY, or save provider credentials 'model_provider'/'doubao'.",
            )
        return "doubao", DoubaoProvider(api_key=api_key)

    # Gemini models (chat + image via generateContent).
    if model.startswith("gemini"):
        api_key = _resolve_api_key(
            env_vars=["GEMINI_API_KEY", "GOOGLE_API_KEY"],
            provider_cred_keys=["gemini", "google"],
        )
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                f"Key for model {model} not configured. Set GEMINI_API_KEY/GOOGLE_API_KEY, or save provider credentials 'gemini'.",
            )
        return "gemini", GeminiProvider(api_key=api_key)

    # Veo models (video).
    if model.startswith("veo-"):
        api_key = _resolve_api_key(
            env_vars=["GEMINI_API_KEY", "GOOGLE_API_KEY"],
            provider_cred_keys=["gemini", "google"],
        )
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                f"Key for model {model} not configured. Set GEMINI_API_KEY/GOOGLE_API_KEY, or save provider credentials 'gemini'.",
            )
        return "veo", VeoProvider(api_key=api_key)

    # Sora models (video).
    if model.startswith("sora"):
        api_key = _resolve_api_key(
            env_vars=["OPENAI_API_KEY"],
            provider_cred_keys=["openai"],
        )
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                f"Key for model {model} not configured. Set OPENAI_API_KEY, or save provider credentials 'openai'.",
            )
        return "sora", SoraProvider(api_key=api_key)

    # Vidu models (video).
    if model.startswith("vidu"):
        api_key = _resolve_api_key(
            env_vars=["VIDU_API_KEY"],
            provider_cred_keys=["vidu"],
        )
        base_url = os.getenv("VIDU_API_BASE", "https://api.vidu.cn")
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                f"Key for model {model} not configured. Set VIDU_API_KEY, or save provider credentials 'vidu'.",
            )
        return "vidu", ViduProvider(api_key=api_key, base_url=base_url)

    # Kling models (video).
    if model.startswith("kling"):
        api_key = resolve_kling_bearer_token(providers=["kling", "klingai"])
        base_url = os.getenv("KLING_API_BASE", "https://api-beijing.klingai.com")
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                (
                    f"Key for model {model} not configured. "
                    "Set KLING_API_KEY, or KLING_ACCESS_KEY + KLING_SECRET_KEY, "
                    "or save provider credentials 'kling' (api_key or app_id/access_token)."
                ),
            )
        return "kling", KlingProvider(api_key=api_key, base_url=base_url)

    # Jimeng Visual CV APIs (super-resolution, etc.).
    if model.startswith("jimeng"):
        access_key = _normalize_key(
            os.getenv("JIMENG_CV_ACCESS_KEY")
            or os.getenv("VOLC_ACCESSKEY")
            or os.getenv("VOLC_ACCESS_KEY")
            or os.getenv("VOLCENGINE_ACCESS_KEY")
        )
        secret_key = _normalize_key(
            os.getenv("JIMENG_CV_SECRET_KEY")
            or os.getenv("VOLC_SECRETKEY")
            or os.getenv("VOLC_SECRET_KEY")
            or os.getenv("VOLCENGINE_SECRET_KEY")
        )
        base_url = os.getenv("JIMENG_VISUAL_API_BASE", "https://visual.volcengineapi.com")
        if not access_key or not secret_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                (
                    f"Keys for model {model} not configured. "
                    "Set JIMENG_CV_ACCESS_KEY + JIMENG_CV_SECRET_KEY (or VOLC_ACCESSKEY/VOLC_SECRETKEY)."
                ),
            )
        return "jimeng_visual", JimengVisualProvider(access_key=access_key, secret_key=secret_key, base_url=base_url)

    # Audio/Qwen.
    if "qwen3-tts" in model:
        api_key = _resolve_api_key(
            env_vars=["DASHSCOPE_API_KEY"],
            provider_cred_keys=["dashscope", "qwen_tts", "dashscope_tts"],
        )
        if not api_key:
            raise GatewayError(
                401,
                "PROVIDER_KEY_MISSING",
                f"Key for model {model} not configured. Set DASHSCOPE_API_KEY, or save provider credentials 'dashscope'.",
            )
        return "qwen", QwenProvider(api_key=api_key)

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
        {"id": "gemini-3.1-flash-image-preview", "object": "model", "owned_by": "google"},
        {"id": "gemini-3-pro-image-preview", "object": "model", "owned_by": "google"},
        {"id": "doubao-seedream-4-5-251128", "object": "model", "owned_by": "doubao"},
        {"id": "sora-2", "object": "model", "owned_by": "sora"},
        {"id": "kling-video-o1", "object": "model", "owned_by": "kling"},
        {"id": "kling-v3-omni", "object": "model", "owned_by": "kling"},
        {"id": "kling-v3", "object": "model", "owned_by": "kling"},
        {"id": "kling-image-o1", "object": "model", "owned_by": "kling"},
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
        {"id": "gemini-3.1-flash-image-preview", "fullName": "Nano Banana 2", "type": "image"},
        {"id": "gemini-3-pro-image-preview", "fullName": "Nano Banana Pro", "type": "image"},
        {"id": "wan2.6-image", "fullName": "Wan 2.6 Image", "type": "image"},
        {"id": "kling-image-o1", "fullName": "kling O1", "type": "image"},
        {"id": "kling-v3", "fullName": "kling V3", "type": "image"},
        
        {"id": "sora-2", "fullName": "Sora 2", "type": "video"},
        {"id": "doubao-seedance-1-5-pro-251215", "fullName": "Doubao Seedance 1.5", "type": "video"},
        {"id": "wan2.6", "fullName": "Wan 2.6 Video", "type": "video"},
        {"id": "veo-3.1-generate-preview", "fullName": "Google Veo 3.1", "type": "video"},
        {"id": "kling-video-o1", "fullName": "kling O1", "type": "video"},
        {"id": "kling-v3-omni", "fullName": "kling O3", "type": "video"},
         
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

@router.get("/model/fullName")
async def get_model_by_full_name(
    fullName: str,
    token: str = Depends(get_hosted_key),
) -> dict[str, Any]:
    """Compatibility endpoint for huobao-canvas model lookup."""
    all_models = [
        {"id": "deepseek-chat", "fullName": "DeepSeek Chat", "type": "chat"},
        {"id": "deepseek-reasoner", "fullName": "DeepSeek Reasoner", "type": "chat"},
        {"id": "gemini-3-pro-preview", "fullName": "Gemini 3 Pro", "type": "chat"},
        {"id": "gemini-3-flash-preview", "fullName": "Gemini 3 Flash", "type": "chat"},

        {"id": "doubao-seedream-4-5-251128", "fullName": "Doubao Seedream 4.5", "type": "image"},
        {"id": "doubao-seedream-4-0-250828", "fullName": "Doubao Seedream 4.0", "type": "image"},
        {"id": "gemini-3.1-flash-image-preview", "fullName": "Nano Banana 2", "type": "image"},
        {"id": "gemini-3-pro-image-preview", "fullName": "Nano Banana Pro", "type": "image"},
        {"id": "wan2.6-t2i", "fullName": "Wan 2.6 T2I", "type": "image"},
        {"id": "wan2.6-image", "fullName": "Wan 2.6 I2I", "type": "image"},
        {"id": "wan2.5-t2i-preview", "fullName": "Wan 2.5 T2I", "type": "image"},
        {"id": "wan2.5-i2i-preview", "fullName": "Wan 2.5 I2I", "type": "image"},
        {"id": "kling-image-o1", "fullName": "kling O1", "type": "image"},
        {"id": "kling-v3", "fullName": "kling V3", "type": "image"},

        {"id": "sora-2", "fullName": "Sora 2", "type": "video"},
        {"id": "sora-2-pro", "fullName": "Sora 2 Pro", "type": "video"},
        {"id": "doubao-seedance-1-5-pro-251215", "fullName": "Doubao Seedance 1.5", "type": "video"},
        {"id": "wan2.6-t2v", "fullName": "Wan 2.6 T2V", "type": "video"},
        {"id": "wan2.6-i2v", "fullName": "Wan 2.6 I2V", "type": "video"},
        {"id": "veo-3.1-generate-preview", "fullName": "Veo 3.1", "type": "video"},
        {"id": "veo-3.1-fast-generate-preview", "fullName": "Veo 3.1 Fast", "type": "video"},
        {"id": "kling-video-o1", "fullName": "kling O1", "type": "video"},
        {"id": "kling-v3-omni", "fullName": "kling O3", "type": "video"},
  
        {"id": "qwen3-tts-flash-2025-11-27", "fullName": "Qwen TTS", "type": "audio"},
    ]
    match = next((m for m in all_models if m["fullName"] == fullName), None)
    return {"code": 200, "msg": "success", "data": match}

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
    _provider_name, provider = resolve_provider(request.model)
    result = await provider.chat_completion(request)
    if request.stream:
        # Providers return an async generator of SSE lines for streaming.
        return StreamingResponse(result, media_type="text/event-stream")
    return result


@router.post("/images/generations")
async def create_image_generation(
    request: ImageGenerationRequest,
    token: str = Depends(get_hosted_key)
):
    _provider_name, provider = resolve_provider(request.model)
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
    
    provider_name, provider = resolve_provider(request.model)
    result = await provider.video_generation(request)
    # Normalize task id to be self-describing for status polling.
    if isinstance(result, dict) and result.get("id"):
        result = {**result, "id": encode_task_id(provider_name, str(result["id"]))}
    return result


@router.get("/videos/{video_id}")
async def get_video_status(
    video_id: str,
    token: str = Depends(get_hosted_key)
):
    decoded = decode_task_id(video_id)
    if not decoded.provider:
        # Backwards-compat: assume Ark-style ids.
        decoded = decode_task_id(f"doubao:{video_id}")

    provider_name = decoded.provider
    raw_id = decoded.raw_id
    if provider_name == "doubao":
        _n, provider = resolve_provider("doubao-seedance-1-5-pro-251215")
    elif provider_name == "dashscope":
        _n, provider = resolve_provider("wan2.6-t2v")
    elif provider_name == "sora":
        _n, provider = resolve_provider("sora-2")
    elif provider_name == "veo":
        _n, provider = resolve_provider("veo-3.1-generate-preview")
    elif provider_name == "vidu":
        _n, provider = resolve_provider("viduq3-pro")
    elif provider_name == "kling":
        _n, provider = resolve_provider("kling-video-o1")
    else:
        raise ModelNotFoundError(provider_name)

    result = await provider.video_status(raw_id)
    # Best-effort normalized view for clients.
    if isinstance(result, dict):
        status_value = result.get("status") or result.get("state") or result.get("task_status")
        if not status_value and isinstance(result.get("output"), dict):
            status_value = (result["output"].get("task_status") or result["output"].get("taskStatus") or "").lower()
        if not status_value and isinstance(result.get("data"), dict):
            status_value = (result["data"].get("task_status") or result["data"].get("taskStatus") or "").lower()
        normalized: dict[str, Any] = {"id": video_id, "provider": provider_name, "provider_response": result}
        if isinstance(status_value, str) and status_value:
            normalized["status"] = status_value

        # Try to surface a canonical video url when the upstream provides one.
        video_url: str | None = None
        if provider_name == "dashscope":
            output = result.get("output") if isinstance(result.get("output"), dict) else {}
            video_url = output.get("video_url") if isinstance(output, dict) else None
        elif provider_name == "sora":
            video_url = result.get("video_url")
        elif provider_name == "veo":
            # Veo content is always served from /content.
            video_url = f"{provider.base_url.rstrip('/')}/v1/videos/{raw_id}/content"
        elif provider_name == "vidu":
            creations = result.get("creations") if isinstance(result.get("creations"), list) else []
            if isinstance(creations, list) and creations:
                first = creations[0] if isinstance(creations[0], dict) else {}
                video_url = first.get("url") if isinstance(first.get("url"), str) else None
        elif provider_name == "kling":
            data = result.get("data") if isinstance(result.get("data"), dict) else None
            task_result = data.get("task_result") if isinstance(data, dict) else None
            videos = task_result.get("videos") if isinstance(task_result, dict) else None
            if isinstance(videos, list) and videos:
                first = videos[0] if isinstance(videos[0], dict) else {}
                video_url = first.get("url") if isinstance(first.get("url"), str) else None
        if isinstance(video_url, str) and video_url.strip():
            normalized["data"] = {"url": video_url.strip()}

        return normalized
    return {"id": video_id, "provider": provider_name, "provider_response": result}


@router.post("/audio/speech")
async def create_audio_speech(
    request: AudioSpeechRequest,
    token: str = Depends(get_hosted_key)
):
    _provider_name, provider = resolve_provider(request.model)
    audio_content = await provider.audio_speech(request)
    return Response(content=audio_content, media_type="audio/mpeg")
    
# Add `router.py` to `__init__.py` or exposes it.
