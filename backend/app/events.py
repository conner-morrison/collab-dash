"""Bridge that lets synchronous request handlers publish realtime events.

FastAPI runs sync endpoints in a threadpool while the event loop runs in the
main thread. We capture that loop at startup and schedule realtime sends onto
it with `run_coroutine_threadsafe`, so business logic stays simple and sync.
"""
from __future__ import annotations

import asyncio
from typing import Any

from .realtime import manager

_loop: asyncio.AbstractEventLoop | None = None


def bind_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def publish(user_ids: list[int], event: str, data: Any) -> None:
    """Fire-and-forget a realtime event to the given users (safe from any thread)."""
    if _loop is None:
        return
    coro = manager.send_to_users(user_ids, event, data)
    try:
        asyncio.run_coroutine_threadsafe(coro, _loop)
    except RuntimeError:
        pass
