from __future__ import annotations

import asyncio
import threading
from typing import Any

import httpx

from langflow.gateway.router import resolve_provider
from langflow.gateway.schemas import (
    AudioSpeechRequest,
    ChatCompletionRequest,
    ImageGenerationRequest,
    VideoGenerationRequest,
)
from langflow.gateway.task_ids import decode_task_id, encode_task_id


def _run_coro_sync(coro):
    """Run an async coroutine from sync code safely (even if an event loop is running)."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    result: dict[str, Any] = {}
    error: dict[str, BaseException] = {}

    def runner():
        try:
            result["value"] = asyncio.run(coro)
        except BaseException as exc:  # noqa: BLE001
            error["exc"] = exc

    t = threading.Thread(target=runner, daemon=True)
    t.start()
    t.join()
    if "exc" in error:
        raise error["exc"]
    return result.get("value")


def chat_completions(
    *, model: str, messages: list[dict[str, Any]], stream: bool = False, user_id: str | None = None, **kwargs
) -> dict[str, Any]:
    provider_name, provider = resolve_provider(model)
    req = ChatCompletionRequest(model=model, messages=messages, stream=stream, **kwargs)
    out = _run_coro_sync(provider.chat_completion(req))
    if stream:
        raise RuntimeError("Streaming chat is not supported via sync gateway client.")
    return out


def images_generations(*, model: str, prompt: str, user_id: str | None = None, **kwargs) -> dict[str, Any]:
    _provider_name, provider = resolve_provider(model)
    req = ImageGenerationRequest(model=model, prompt=prompt, **kwargs)
    return _run_coro_sync(provider.image_generation(req))


def videos_create(*, model: str, prompt: str, user_id: str | None = None, **kwargs) -> dict[str, Any]:
    provider_name, provider = resolve_provider(model)
    req = VideoGenerationRequest(model=model, prompt=prompt, **kwargs)
    result = _run_coro_sync(provider.video_generation(req))
    if isinstance(result, dict) and result.get("id"):
        result = {**result, "id": encode_task_id(provider_name, str(result["id"]))}
    return result


def videos_status(*, video_id: str, user_id: str | None = None) -> dict[str, Any]:
    decoded = decode_task_id(video_id)
    if not decoded.provider:
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
        raise ValueError(f"Unknown provider in task id: {provider_name!r}")

    result = _run_coro_sync(provider.video_status(raw_id))
    normalized: dict[str, Any] = {"id": video_id, "provider": provider_name, "provider_response": result}
    if isinstance(result, dict):
        status_value = result.get("status") or result.get("state") or result.get("task_status")
        if not status_value and isinstance(result.get("output"), dict):
            status_value = (result["output"].get("task_status") or result["output"].get("taskStatus") or "").lower()
        if not status_value and isinstance(result.get("data"), dict):
            status_value = (result["data"].get("task_status") or result["data"].get("taskStatus") or "").lower()
        if isinstance(status_value, str) and status_value:
            normalized["status"] = status_value

        video_url: str | None = None
        if provider_name == "dashscope":
            output = result.get("output") if isinstance(result.get("output"), dict) else {}
            video_url = output.get("video_url") if isinstance(output, dict) else None
        elif provider_name == "sora":
            video_url = result.get("video_url") if isinstance(result.get("video_url"), str) else None
        elif provider_name == "veo":
            video_url = f"{provider.base_url.rstrip('/')}/v1/videos/{raw_id}/content"
        elif provider_name == "vidu":
            creations = result.get("creations") if isinstance(result.get("creations"), list) else []
            if creations:
                first = creations[0] if isinstance(creations[0], dict) else {}
                video_url = first.get("url") if isinstance(first.get("url"), str) else None
        elif provider_name == "kling":
            data = result.get("data") if isinstance(result.get("data"), dict) else None
            task_result = data.get("task_result") if isinstance(data, dict) else None
            videos = task_result.get("videos") if isinstance(task_result, dict) else None
            if isinstance(videos, list) and videos:
                first = videos[0] if isinstance(videos[0], dict) else {}
                video_url = first.get("url") if isinstance(first.get("url"), str) else None
        elif provider_name == "doubao":
            video_url = result.get("video_url") if isinstance(result.get("video_url"), str) else None

        if video_url:
            normalized["video_url"] = video_url

    return normalized


def videos_content(*, video_id: str, user_id: str | None = None) -> bytes:
    decoded = decode_task_id(video_id)
    if not decoded.provider:
        decoded = decode_task_id(f"doubao:{video_id}")

    provider_name = decoded.provider
    raw_id = decoded.raw_id

    if provider_name != "veo":
        raise ValueError("Only Veo content download is supported by the sync gateway client.")

    _n, provider = resolve_provider("veo-3.1-generate-preview")
    url = f"{provider.base_url.rstrip('/')}/v1/videos/{raw_id}/content"

    headers = {}
    if provider.api_key:
        headers["x-goog-api-key"] = provider.api_key

    response = httpx.get(url, headers=headers, timeout=120.0)
    response.raise_for_status()
    return response.content


def audio_speech(*, model: str, input: str, voice: str, user_id: str | None = None, **kwargs) -> bytes:
    _provider_name, provider = resolve_provider(model)
    req = AudioSpeechRequest(model=model, input=input, voice=voice, **kwargs)
    return _run_coro_sync(provider.audio_speech(req))
