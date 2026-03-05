from __future__ import annotations

import asyncio
import os
import threading
import uuid
from typing import Any

import httpx

from langflow.gateway.errors import AuthError
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


def _normalize_token(value: str | None) -> str | None:
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
    v = "".join(v.split())
    return v or None


def _load_model_api_key_variable(*, user_id: str | None) -> str | None:
    """Read MODEL_API_KEY from the Variables table (Settings -> Model Config page)."""

    async def _fetch(resolved_user_id: str | None):
        from langflow.services.deps import get_variable_service, session_scope
        from langflow.services.database.models.variable.model import Variable
        from sqlmodel import select

        variable_service = get_variable_service()
        async with session_scope() as session:
            try:
                # If no user_id is provided (e.g. in-process call without graph context),
                # fall back to the single stored MODEL_API_KEY if it is unambiguous.
                uid = None
                if resolved_user_id:
                    try:
                        uid = uuid.UUID(str(resolved_user_id))
                    except Exception:
                        uid = resolved_user_id  # best-effort; may still work in some backends

                if not uid:
                    rows = list((await session.exec(select(Variable).where(Variable.name == "MODEL_API_KEY"))).all())
                    if len(rows) == 1:
                        uid = rows[0].user_id

                if not uid:
                    return None

                return await variable_service.get_variable(user_id=uid, name="MODEL_API_KEY", field="", session=session)
            except Exception:
                return None

    try:
        return _normalize_token(_run_coro_sync(_fetch(user_id)))
    except Exception:
        return None


def _require_valid_hosted_key(*, user_id: str | None) -> str:
    """
    Enforce the Hosted Gateway key requirement for custom components.

    - The user enters the key on Settings -> Model Config page, stored as Variable MODEL_API_KEY.
    - We validate it the same way as the public gateway endpoints do (env master key or DB api keys).
    """
    token = _load_model_api_key_variable(user_id=user_id) or _normalize_token(os.getenv("HOSTED_GATEWAY_KEY"))
    if not token:
        raise AuthError("未配置 API Key，请先在“设置 -> 模型配置”页面填写。")

    # Master key (dev/ops) bypass.
    expected = _normalize_token(os.getenv("HOSTED_GATEWAY_KEY"))
    if expected and token == expected:
        return token

    async def _validate_db():
        from langflow.services.deps import session_scope
        from langflow.services.database.models.api_key.crud import check_key

        async with session_scope() as session:
            user = await check_key(session, token)
            if not user:
                return False
            # If we know the caller user_id, require the key to belong to the same user.
            if user_id:
                try:
                    if uuid.UUID(str(user_id)) != user.id:
                        return False
                except Exception:
                    # If user_id isn't a UUID string, skip strict matching.
                    pass
            return True

    ok = bool(_run_coro_sync(_validate_db()))
    if not ok:
        raise AuthError("API Key 无效、已过期或不属于当前用户，请在“设置 -> API Keys”重新生成后再填写。")
    return token


def chat_completions(
    *, model: str, messages: list[dict[str, Any]], stream: bool = False, user_id: str | None = None, **kwargs
) -> dict[str, Any]:
    _require_valid_hosted_key(user_id=user_id)
    provider_name, provider = resolve_provider(model)
    req = ChatCompletionRequest(model=model, messages=messages, stream=stream, **kwargs)
    out = _run_coro_sync(provider.chat_completion(req))
    if stream:
        raise RuntimeError("Streaming chat is not supported via sync gateway client.")
    return out


def images_generations(*, model: str, prompt: str, user_id: str | None = None, **kwargs) -> dict[str, Any]:
    _require_valid_hosted_key(user_id=user_id)
    _provider_name, provider = resolve_provider(model)
    req = ImageGenerationRequest(model=model, prompt=prompt, **kwargs)
    return _run_coro_sync(provider.image_generation(req))


def videos_create(*, model: str, prompt: str, user_id: str | None = None, **kwargs) -> dict[str, Any]:
    _require_valid_hosted_key(user_id=user_id)
    provider_name, provider = resolve_provider(model)
    req = VideoGenerationRequest(model=model, prompt=prompt, **kwargs)
    result = _run_coro_sync(provider.video_generation(req))
    if isinstance(result, dict) and result.get("id"):
        result = {**result, "id": encode_task_id(provider_name, str(result["id"]))}
    return result


def videos_status(*, video_id: str, user_id: str | None = None) -> dict[str, Any]:
    _require_valid_hosted_key(user_id=user_id)
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
            # Vidu returns a list of creations with `url`.
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
        if isinstance(video_url, str) and video_url.strip():
            normalized["data"] = {"url": video_url.strip()}

    return normalized


def videos_content(*, video_id: str, user_id: str | None = None) -> tuple[bytes, str | None]:
    """Fetch video bytes for providers that expose a separate content endpoint (currently Veo only)."""
    _require_valid_hosted_key(user_id=user_id)
    decoded = decode_task_id(video_id)
    if not decoded.provider:
        decoded = decode_task_id(f"doubao:{video_id}")

    provider_name = decoded.provider
    raw_id = decoded.raw_id

    if provider_name != "veo":
        raise ValueError(f"video content fetch not supported for provider: {provider_name!r}")

    _n, provider = resolve_provider("veo-3.1-generate-preview")

    async def _fetch():
        url = f"{provider.base_url.rstrip('/')}/v1/videos/{raw_id}/content"
        headers = {"Authorization": f"Bearer {provider.api_key}"}
        timeout = httpx.Timeout(60.0, connect=20.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.content, resp.headers.get("Content-Type")

    return _run_coro_sync(_fetch())


def audio_speech(*, model: str, input: str, voice: str, user_id: str | None = None, **kwargs) -> bytes:
    _require_valid_hosted_key(user_id=user_id)
    _provider_name, provider = resolve_provider(model)
    req = AudioSpeechRequest(model=model, input=input, voice=voice, **kwargs)
    return _run_coro_sync(provider.audio_speech(req))
