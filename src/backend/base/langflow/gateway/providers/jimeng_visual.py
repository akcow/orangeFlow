import datetime as _dt
import hashlib
import hmac
import json
import time
from typing import Any, Dict
from urllib.parse import quote, urlparse

import httpx

from langflow.gateway.errors import UpstreamError
from langflow.gateway.providers.base import ProviderAdapter
from langflow.gateway.schemas import ImageGenerationRequest


def _hmac_sha256(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonical_query_string(params: dict[str, str]) -> str:
    # Follow AWS SigV4-style encoding rules.
    items = sorted((str(k), str(v)) for k, v in (params or {}).items())
    return "&".join(f"{quote(k, safe='-_.~')}={quote(v, safe='-_.~')}" for k, v in items)


def _sign_volc_request(
    *,
    method: str,
    host: str,
    path: str,
    query: dict[str, str],
    body: bytes,
    access_key: str,
    secret_key: str,
    region: str = "cn-north-1",
    service: str = "cv",
    content_type: str = "application/json",
) -> dict[str, str]:
    """
    Minimal Volcengine (SigV4-like) signer for Visual CV APIs.

    Canonical headers:
      - content-type
      - host
      - x-content-sha256
      - x-date
    """
    now = _dt.datetime.utcnow()
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    canonical_uri = path or "/"
    canonical_querystring = _canonical_query_string(query)
    payload_hash = _sha256_hex(body or b"")

    headers_to_sign = {
        "content-type": content_type,
        "host": host,
        "x-content-sha256": payload_hash,
        "x-date": amz_date,
    }
    signed_header_keys = sorted(headers_to_sign.keys())
    canonical_headers = "".join(f"{k}:{str(headers_to_sign[k]).strip()}\n" for k in signed_header_keys)
    signed_headers = ";".join(signed_header_keys)

    canonical_request = "\n".join(
        [
            method.upper(),
            canonical_uri,
            canonical_querystring,
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )

    algorithm = "HMAC-SHA256"
    credential_scope = f"{date_stamp}/{region}/{service}/request"
    string_to_sign = "\n".join(
        [
            algorithm,
            amz_date,
            credential_scope,
            _sha256_hex(canonical_request.encode("utf-8")),
        ]
    )

    k_date = _hmac_sha256(("VOLC" + secret_key).encode("utf-8"), date_stamp)
    k_region = _hmac_sha256(k_date, region)
    k_service = _hmac_sha256(k_region, service)
    k_signing = _hmac_sha256(k_service, "request")
    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    authorization = (
        f"{algorithm} Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    # Return headers in the exact casing expected by upstream APIs.
    return {
        "Content-Type": content_type,
        "Host": host,
        "X-Date": amz_date,
        "X-Content-Sha256": payload_hash,
        "Authorization": authorization,
    }


class JimengVisualProvider(ProviderAdapter):
    """
    Adapter for Volcengine Visual CV APIs used by Jimeng services.

    Currently supported:
      - jimeng-smart-hd: 即梦智能超清 (req_key: jimeng_i2i_seed3_tilesr_cvtob)
    """

    MODEL_TO_REQ_KEY: dict[str, str] = {
        "jimeng-smart-hd": "jimeng_i2i_seed3_tilesr_cvtob",
    }

    def __init__(self, access_key: str, secret_key: str, base_url: str | None = None):
        super().__init__(api_key=access_key, base_url=base_url)
        import os

        self.access_key = access_key
        self.secret_key = secret_key
        self.base_url = (base_url or os.getenv("JIMENG_VISUAL_API_BASE") or "https://visual.volcengineapi.com").rstrip(
            "/"
        )

    async def image_generation(self, request: ImageGenerationRequest) -> Dict[str, Any]:
        model = str(request.model or "").strip()
        req_key = self.MODEL_TO_REQ_KEY.get(model)
        if not req_key:
            raise UpstreamError(f"Unknown Jimeng Visual model: {model}", provider="jimeng_visual")

        extra = request.extra_body if isinstance(request.extra_body, dict) else {}
        resolution = str(extra.get("resolution") or "4k").strip().lower()
        if resolution not in {"4k", "8k"}:
            resolution = "4k"

        try:
            scale = int(extra.get("scale", 50))
        except Exception:
            scale = 50
        scale = max(0, min(100, scale))

        b64 = extra.get("binary_data_base64")
        if isinstance(b64, list):
            b64_list = [str(x).strip() for x in b64 if str(x).strip()]
        elif isinstance(b64, str) and b64.strip():
            b64_list = [b64.strip()]
        else:
            b64_list = []

        image_urls = extra.get("image_urls")
        if isinstance(image_urls, list):
            url_list = [str(x).strip() for x in image_urls if str(x).strip()]
        elif isinstance(image_urls, str) and image_urls.strip():
            url_list = [image_urls.strip()]
        else:
            url_list = []

        if not b64_list and not url_list:
            raise UpstreamError("Missing input image (binary_data_base64/image_urls).", provider="jimeng_visual")

        # --- Submit task ---
        submit_query = {"Action": "CVSync2AsyncSubmitTask", "Version": "2022-08-31"}
        submit_body: dict[str, Any] = {
            "req_key": req_key,
            "resolution": resolution,
            "scale": scale,
        }
        if b64_list:
            submit_body["binary_data_base64"] = b64_list[:1]
        if url_list and not b64_list:
            submit_body["image_urls"] = url_list[:1]

        submit_bytes = json.dumps(submit_body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        submit_url = f"{self.base_url}/"
        parsed_base = urlparse(submit_url)
        host = parsed_base.netloc or "visual.volcengineapi.com"
        submit_headers = _sign_volc_request(
            method="POST",
            host=host,
            path="/",
            query=submit_query,
            body=submit_bytes,
            access_key=self.access_key,
            secret_key=self.secret_key,
        )

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                submit_resp = await client.post(submit_url, params=submit_query, headers=submit_headers, content=submit_bytes)
        except httpx.RequestError as exc:
            raise UpstreamError(f"Request failed: {exc}", provider="jimeng_visual")

        if submit_resp.status_code != 200:
            raise UpstreamError(
                f"Upstream returned HTTP {submit_resp.status_code}: {submit_resp.text[:500]}",
                provider="jimeng_visual",
            )

        try:
            submit_json = submit_resp.json()
        except Exception:
            raise UpstreamError(f"Invalid upstream JSON: {submit_resp.text[:500]}", provider="jimeng_visual")

        if submit_json.get("code") != 10000:
            raise UpstreamError(str(submit_json.get("message") or submit_json), provider="jimeng_visual")

        task_id = (submit_json.get("data") or {}).get("task_id")
        task_id = str(task_id or "").strip()
        if not task_id:
            raise UpstreamError(f"Missing task_id: {submit_json}", provider="jimeng_visual")

        # --- Poll result ---
        poll_query = {"Action": "CVSync2AsyncGetResult", "Version": "2022-08-31"}
        # Request URL output; otherwise some accounts may only return base64.
        req_json = json.dumps({"return_url": True}, ensure_ascii=False, separators=(",", ":"))
        poll_body = {
            "req_key": req_key,
            "task_id": task_id,
            "req_json": req_json,
        }
        poll_bytes = json.dumps(poll_body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

        poll_started = time.monotonic()
        poll_timeout_s = float(extra.get("poll_timeout_s", 120) or 120)
        poll_interval_s = float(extra.get("poll_interval_s", 1.0) or 1.0)
        poll_interval_s = max(0.2, min(5.0, poll_interval_s))

        last_json: dict[str, Any] | None = None
        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                poll_headers = _sign_volc_request(
                    method="POST",
                    host=host,
                    path="/",
                    query=poll_query,
                    body=poll_bytes,
                    access_key=self.access_key,
                    secret_key=self.secret_key,
                )
                try:
                    poll_resp = await client.post(submit_url, params=poll_query, headers=poll_headers, content=poll_bytes)
                except httpx.RequestError as exc:
                    raise UpstreamError(f"Request failed: {exc}", provider="jimeng_visual")

                if poll_resp.status_code != 200:
                    raise UpstreamError(
                        f"Upstream returned HTTP {poll_resp.status_code}: {poll_resp.text[:500]}",
                        provider="jimeng_visual",
                    )

                try:
                    last_json = poll_resp.json()
                except Exception:
                    raise UpstreamError(f"Invalid upstream JSON: {poll_resp.text[:500]}", provider="jimeng_visual")

                data = last_json.get("data") if isinstance(last_json, dict) else None
                status = (data.get("status") if isinstance(data, dict) else None) or ""
                status = str(status).strip().lower()

                if status in {"in_queue", "generating"}:
                    if time.monotonic() - poll_started > poll_timeout_s:
                        raise UpstreamError(f"Polling timeout (status={status}, task_id={task_id})", provider="jimeng_visual")
                    await asyncio_sleep(poll_interval_s)
                    continue

                if status in {"not_found", "expired"}:
                    raise UpstreamError(f"Task {task_id} {status}", provider="jimeng_visual")

                if status and status != "done":
                    raise UpstreamError(f"Unexpected task status: {status}", provider="jimeng_visual")

                # done: success or failure is reflected in outer code/message.
                if last_json.get("code") != 10000:
                    raise UpstreamError(str(last_json.get("message") or last_json), provider="jimeng_visual")

                urls = []
                if isinstance(data, dict) and isinstance(data.get("image_urls"), list):
                    urls = [str(u).strip() for u in data["image_urls"] if isinstance(u, str) and u.strip()]
                if not urls:
                    raise UpstreamError(f"No image_urls returned: {last_json}", provider="jimeng_visual")

                return {
                    "id": task_id,
                    "data": [{"url": urls[0]}],
                    "provider_response": {"submit": submit_json, "result": last_json},
                }


async def asyncio_sleep(seconds: float) -> None:
    # Local tiny helper: avoid importing asyncio at module import for faster cold starts in some environments.
    import asyncio

    await asyncio.sleep(seconds)
