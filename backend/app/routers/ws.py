"""WebSocket endpoint. Clients authenticate with a JWT access token via the
`token` query parameter, then receive server-pushed events in real time.
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Friend, User
from ..realtime import manager
from ..security import decode_token
from ..services import other_member

router = APIRouter()


def _friend_ids(db: Session, user_id: int) -> list[int]:
    rows = db.query(Friend).filter((Friend.user_a_id == user_id) | (Friend.user_b_id == user_id)).all()
    return [other_member(f, user_id) for f in rows]


async def _presence(user_id: int, online: bool) -> None:
    db = SessionLocal()
    try:
        for fid in _friend_ids(db, user_id):
            await manager.send_to_user(fid, "presence", {"user_id": user_id, "online": online})
    finally:
        db.close()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    try:
        user_id = decode_token(token, "access")
    except Exception:
        await websocket.close(code=1008)
        return

    db = SessionLocal()
    try:
        user = db.get(User, user_id)
    finally:
        db.close()
    if not user:
        await websocket.close(code=1008)
        return

    await manager.connect(user_id, websocket)
    await _presence(user_id, True)
    # Tell the newcomer who is already online.
    await websocket.send_json({"event": "presence_snapshot", "data": {"online": list(manager.online_users())}})
    try:
        while True:
            # We don't require client messages; ping/pong keeps the socket alive.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(user_id, websocket)
        if not manager.is_online(user_id):
            await _presence(user_id, False)
