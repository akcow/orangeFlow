from __future__ import annotations

from typing import Any, Dict

import httpx

from langflow.gateway.errors import UpstreamError
from langflow.gateway.providers.base import ProviderAdapter
from langflow.gateway.schemas import VideoGenerationRequest


class ViduProvider(ProviderAdapter):
    """Adapter for Vidu (viduq3-pro text2video/img2video)."""

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

    async def video_generation(self, request: VideoGenerationRequest) -> Dict[str, Any]:
        extra = request.extra_body or {}

        images = extra.get("images") or []
        if isinstance(images, str):
            images = [images]
        if not isinstance(images, list):
            images = []
        images = [str(v).strip() for v in images if isinstance(v, str) and v.strip()]

        is_i2v = bool(images)
        path = "/ent/v2/img2video" if is_i2v else "/ent/v2/text2video"
        url = f"{self.base_url}{path}"

        # Common knobs (kept minimal + passthrough friendly).
        duration = int(request.duration or 5)
        ratio = (request.ratio or "16:9").strip()
        resolution = str(extra.get("resolution") or "720p").strip() or "720p"
        seed = int(extra.get("seed") or 0)
        movement_amplitude = str(extra.get("movement_amplitude") or "auto").strip() or "auto"
        bgm = bool(extra.get("bgm", False))
        audio = bool(extra.get("audio", True))
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

        if is_i2v:
            # img2video: only 1 image is supported per doc.
            body["images"] = images[:1]
            body["audio"] = audio
            body["is_rec"] = is_rec
            if not is_rec:
                body["prompt"] = str(request.prompt or "")
            if voice_id and audio:
                body["voice_id"] = voice_id
            # bgm is accepted by API but may not be effective for some models/durations.
            body["bgm"] = bgm
        else:
            # text2video requires prompt + aspect_ratio
            body["prompt"] = str(request.prompt or "")
            body["aspect_ratio"] = ratio
            body["bgm"] = bgm
            body["audio"] = audio

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

