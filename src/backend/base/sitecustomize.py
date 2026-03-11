"""Process-wide Python startup tweaks for local Windows development.

Imported automatically by Python when this directory is on ``sys.path``.
"""

from __future__ import annotations

import asyncio
import platform


if platform.system() == "Windows":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())  # type: ignore[attr-defined]
    except Exception:
        pass
