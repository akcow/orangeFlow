from __future__ import annotations

import asyncio


def selector_loop_factory(use_subprocess: bool = False):
    """Force uvicorn to use a Selector event loop on Windows.

    Psycopg async mode is incompatible with uvicorn's default Windows Proactor loop.
    """
    return asyncio.SelectorEventLoop()
