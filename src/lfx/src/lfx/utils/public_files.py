from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class PublicFileToken:
    value: str
    expires_at: int


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


def _sign(secret_key: str, payload: bytes) -> str:
    digest = hmac.new(secret_key.encode("utf-8"), payload, hashlib.sha256).digest()
    return _b64url_encode(digest)


def generate_public_file_token(
    *,
    secret_key: str,
    flow_id: str,
    file_name: str,
    ttl_seconds: int = 3600,
    now: int | None = None,
) -> PublicFileToken:
    now_ts = int(now if now is not None else time.time())
    expires_at = now_ts + int(ttl_seconds)
    payload_obj = {"flow_id": flow_id, "file_name": file_name, "exp": expires_at}
    payload = json.dumps(payload_obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    token = f"{_b64url_encode(payload)}.{_sign(secret_key, payload)}"
    return PublicFileToken(value=token, expires_at=expires_at)


def verify_public_file_token(
    *,
    secret_key: str,
    token: str,
    flow_id: str,
    file_name: str,
    now: int | None = None,
) -> bool:
    try:
        payload_b64, signature = token.split(".", 1)
        payload = _b64url_decode(payload_b64)
        expected_sig = _sign(secret_key, payload)
        if not hmac.compare_digest(signature, expected_sig):
            return False
        data = json.loads(payload.decode("utf-8"))
        if str(data.get("flow_id") or "") != str(flow_id):
            return False
        if str(data.get("file_name") or "") != str(file_name):
            return False
        exp = int(data.get("exp") or 0)
        now_ts = int(now if now is not None else time.time())
        return now_ts <= exp
    except Exception:
        return False

