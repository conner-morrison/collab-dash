"""Real-time layer.

A thin publish/subscribe abstraction over per-user WebSocket connections.
The default `MemoryBroadcaster` fans out within a single process. In production
this is where a Redis Pub/Sub backend would plug in (see settings.broadcaster)
so that multiple API instances share one realtime bus.

Events are addressed to *user ids*; callers resolve which users should receive
an event (e.g. both members of a friendship) and publish to each.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # user_id -> set of live sockets (a user may have several tabs open)
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[user_id].add(websocket)

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                self._connections.pop(user_id, None)

    def is_online(self, user_id: int) -> bool:
        return bool(self._connections.get(user_id))

    def online_users(self) -> set[int]:
        return set(self._connections.keys())

    async def send_to_user(self, user_id: int, event: str, data: Any) -> None:
        payload = {"event": event, "data": data}
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(user_id, set())):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(user_id, ws)

    async def send_to_users(self, user_ids: list[int], event: str, data: Any) -> None:
        for uid in user_ids:
            await self.send_to_user(uid, event, data)


manager = ConnectionManager()
