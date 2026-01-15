from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DecodedTaskId:
    provider: str
    raw_id: str


def encode_task_id(provider: str, raw_id: str) -> str:
    provider = (provider or "").strip()
    raw_id = (raw_id or "").strip()
    if not provider or not raw_id:
        return raw_id
    # Use a simple, URL-safe prefix format.
    return f"{provider}:{raw_id}"


def decode_task_id(task_id: str) -> DecodedTaskId:
    task_id = (task_id or "").strip()
    if ":" not in task_id:
        # Backwards-compat: treat as "unknown" provider.
        return DecodedTaskId(provider="", raw_id=task_id)
    provider, raw = task_id.split(":", 1)
    return DecodedTaskId(provider=provider.strip(), raw_id=raw.strip())

