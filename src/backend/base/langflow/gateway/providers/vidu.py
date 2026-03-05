from __future__ import annotations

from typing import Any, Dict

import httpx

from langflow.gateway.errors import UpstreamError
from langflow.gateway.providers.base import ProviderAdapter
from langflow.gateway.schemas import VideoGenerationRequest


class ViduProvider(ProviderAdapter):
    """Adapter for Vidu (text2video/img2video/start-end2video/reference2video)."""

    def __init__(self, api_key: str, base_url: str | None = None):
        super().__init__(api_key, base_url)
        import os

        self.base_url = (base_url or os.getenv("VIDU_API_BASE") or "https://api.vidu.cn").rstrip("/")

    def _headers(self) -> dict[str, str]:
        # Vidu uses `Authorization: Token ...` (not Bearer).
        return {
            "Content-Type": "application/json",
            "Authorization": f"Token {self.api_key}",
            "Connection": "close",
        }

    async def _video_upscale(self, request: VideoGenerationRequest) -> Dict[str, Any]:
        extra = request.extra_body or {}
        video_url = str(extra.get("video_url") or "").strip()
        video_creation_id = str(extra.get("video_creation_id") or "").strip()
        if not video_url and not video_creation_id:
            raise UpstreamError(
                "vidu-upscale requires `video_url` or `video_creation_id`.",
                provider="vidu",
            )

        upscale_resolution = str(extra.get("upscale_resolution") or "1080p").strip() or "1080p"
        allowed_resolutions = {"1080p", "2K", "4K", "8K"}
        if upscale_resolution not in allowed_resolutions:
            raise UpstreamError(
                f"Invalid `upscale_resolution`: {upscale_resolution}",
                provider="vidu",
            )

        payload = extra.get("payload")
        if isinstance(payload, str) and len(payload) > 1_048_576:
            raise UpstreamError("`payload` exceeds max length (1048576).", provider="vidu")

        callback_url = str(extra.get("callback_url") or "").strip()

        body: dict[str, Any] = {"upscale_resolution": upscale_resolution}
        if video_url:
            body["video_url"] = video_url
        if video_creation_id:
            body["video_creation_id"] = video_creation_id
        if payload not in (None, ""):
            body["payload"] = payload
        if callback_url:
            body["callback_url"] = callback_url

        url = f"{self.base_url}/ent/v2/upscale-new"
        try:
            timeout = httpx.Timeout(60.0, connect=20.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, headers=self._headers(), json=body)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="vidu", code=f"UPSTREAM_{resp.status_code}")
                data = resp.json()
                task_id = str((data or {}).get("task_id") or "").strip()
                if not task_id:
                    raise UpstreamError(f"Missing task_id in response: {data}", provider="vidu")
                return {"id": task_id, "provider_response": data}
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="vidu")

    async def video_generation(self, request: VideoGenerationRequest) -> Dict[str, Any]:
        extra = request.extra_body or {}
        model_lower = str(request.model or "").strip().lower().replace("_", "-")
        if model_lower in {"vidu-upscale", "vidu-video-upscale"}:
            return await self._video_upscale(request)

        images = extra.get("images") or []
        if isinstance(images, str):
            images = [images]
        if not isinstance(images, list):
            images = []
        images = [str(v).strip() for v in images if isinstance(v, str) and v.strip()]

        videos = extra.get("videos") or []
        if isinstance(videos, str):
            videos = [videos]
        if not isinstance(videos, list):
            videos = []
        videos = [str(v).strip() for v in videos if isinstance(v, str) and v.strip()]

        # Auto-route:
        # - reference2video when reference videos are provided
        # - start-end2video when 2+ images are provided
        # - img2video when 1 image is provided
        # - text2video otherwise
        if videos:
            path = "/ent/v2/reference2video"
        elif len(images) >= 2:
            path = "/ent/v2/start-end2video"
        elif len(images) == 1:
            path = "/ent/v2/img2video"
        else:
            path = "/ent/v2/text2video"
        url = f"{self.base_url}{path}"

        # Common knobs (kept minimal + passthrough friendly).
        # Note: Vidu reference2video supports duration=0 (auto); preserve 0.
        duration = 5 if request.duration is None else int(request.duration)
        ratio = (request.ratio or "16:9").strip()
        resolution = str(extra.get("resolution") or "720p").strip() or "720p"
        seed = int(extra.get("seed") or 0)
        movement_amplitude = str(extra.get("movement_amplitude") or "auto").strip() or "auto"
        bgm = bool(extra.get("bgm", False))
        model_lower = str(request.model or "").strip().lower()
        is_q3 = "viduq3" in model_lower or model_lower.startswith("q3")
        # Docs: audio default false; q3 defaults true.
        audio = bool(extra["audio"]) if "audio" in extra else bool(is_q3)
        voice_id = str(extra.get("voice_id") or "").strip()
        is_rec = bool(extra.get("is_rec", False))
        off_peak = bool(extra.get("off_peak", False))
        watermark = bool(extra.get("watermark", False))
        wm_position = int(extra.get("wm_position") or 3)
        wm_url = str(extra.get("wm_url") or "").strip()
        payload = extra.get("payload")
        meta_data = extra.get("meta_data")
        callback_url = str(extra.get("callback_url") or "").strip()

        body: dict[str, Any] = {
            "model": request.model,
            "duration": duration,
            "seed": seed,
            "resolution": resolution,
            "movement_amplitude": movement_amplitude,
            "off_peak": off_peak,
            "watermark": watermark,
            "wm_position": wm_position,
        }

        if path == "/ent/v2/img2video":
            # img2video: only 1 image is supported per doc.
            body["images"] = images[:1]
            body["is_rec"] = is_rec
            if not is_rec:
                body["prompt"] = str(request.prompt or "")
            body["bgm"] = bgm
            # Audio/direct-out: available, but off_peak is only supported by q3 when audio=true.
            body["audio"] = audio
            if audio and not is_q3:
                body["off_peak"] = False
            if voice_id and audio and not is_q3:
                body["voice_id"] = voice_id
        elif path == "/ent/v2/start-end2video":
            # start-end2video: exactly 2 images (start, end)
            body["images"] = images[:2]
            body["is_rec"] = is_rec
            if not is_rec:
                body["prompt"] = str(request.prompt or "")
            body["bgm"] = bgm
            # Docs: no audio/voice_id for start-end2video.
        elif path == "/ent/v2/reference2video":
            # reference2video (non-subject/video generation): docs do NOT include `audio`/`voice_id`.
            # For viduq2-pro, when providing videos, images are limited to 1-4.
            if model_lower == "viduq2-pro" and videos:
                body["images"] = images[:4]
            else:
                body["images"] = images[:7]
            body["videos"] = videos[:2]
            body["prompt"] = str(request.prompt or "")
            body["bgm"] = bgm
            body["aspect_ratio"] = ratio
        else:
            # text2video requires prompt + aspect_ratio
            body["prompt"] = str(request.prompt or "")
            body["aspect_ratio"] = ratio
            body["bgm"] = bgm
            # Docs: audio isn't supported outside q3; keep it out of the request for t2v.

        if wm_url:
            body["wm_url"] = wm_url
        if payload:
            body["payload"] = payload
        if meta_data:
            body["meta_data"] = meta_data
        if callback_url:
            body["callback_url"] = callback_url

        try:
            timeout = httpx.Timeout(60.0, connect=20.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, headers=self._headers(), json=body)
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="vidu", code=f"UPSTREAM_{resp.status_code}")
                data = resp.json()
                task_id = str((data or {}).get("task_id") or "").strip()
                if not task_id:
                    raise UpstreamError(f"Missing task_id in response: {data}", provider="vidu")
                return {"id": task_id, "provider_response": data}
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="vidu")

    async def video_status(self, video_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/ent/v2/tasks/{video_id}/creations"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url, headers=self._headers())
                if resp.status_code != 200:
                    raise UpstreamError(resp.text, provider="vidu", code=f"UPSTREAM_{resp.status_code}")
                return resp.json()
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="vidu")
