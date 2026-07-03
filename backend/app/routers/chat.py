"""Private one-to-one messaging with read status and live updates."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import events
from ..database import get_db
from ..models import Message, User
from ..schemas import MessageOut, SendMessageIn
from ..security import get_current_user
from ..services import get_friendship, notify, other_member

router = APIRouter(prefix="/api/friendships", tags=["chat"])


@router.get("/{friendship_id}/messages", response_model=list[MessageOut])
def list_messages(friendship_id: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_friendship(db, current.id, friendship_id)
    return (
        db.query(Message)
        .filter(Message.friendship_id == friendship_id)
        .order_by(Message.created_at.asc())
        .all()
    )


@router.post("/{friendship_id}/messages", response_model=MessageOut, status_code=201)
def send_message(
    friendship_id: int,
    payload: SendMessageIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    friendship = get_friendship(db, current.id, friendship_id)
    msg = Message(friendship_id=friendship_id, sender_id=current.id, body=payload.body)
    db.add(msg)
    db.flush()
    recipient = other_member(friendship, current.id)
    notify(db, recipient, "message", f"Message from {current.display_name}", payload.body[:80])
    db.commit()
    out = MessageOut.model_validate(msg).model_dump(mode="json")
    events.publish([friendship.user_a_id, friendship.user_b_id], "message_created", out)
    return msg


@router.post("/{friendship_id}/messages/read")
def mark_read(friendship_id: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    friendship = get_friendship(db, current.id, friendship_id)
    updated = (
        db.query(Message)
        .filter(
            Message.friendship_id == friendship_id,
            Message.sender_id != current.id,
            Message.is_read == False,  # noqa: E712
        )
        .update({Message.is_read: True})
    )
    db.commit()
    if updated:
        events.publish(
            [friendship.user_a_id, friendship.user_b_id],
            "messages_read",
            {"friendship_id": friendship_id, "reader_id": current.id},
        )
    return {"updated": updated}
