"""Private one-to-one messaging with read status, edit/delete, and live updates."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import events
from ..database import get_db
from ..models import Message, User
from ..schemas import EditMessageIn, MessageOut, SendMessageIn
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


def _get_own_message(db: Session, friendship, message_id: int, user_id: int) -> Message:
    msg = db.get(Message, message_id)
    if not msg or msg.friendship_id != friendship.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    if msg.sender_id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only modify your own messages")
    return msg


@router.patch("/{friendship_id}/messages/{message_id}", response_model=MessageOut)
def edit_message(
    friendship_id: int,
    message_id: int,
    payload: EditMessageIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    friendship = get_friendship(db, current.id, friendship_id)
    msg = _get_own_message(db, friendship, message_id, current.id)
    # Only editable until the recipient has read it.
    if msg.is_read:
        raise HTTPException(status.HTTP_409_CONFLICT, "Message already read — it can no longer be edited")
    msg.body = payload.body
    msg.edited_at = datetime.now(timezone.utc)
    db.commit()
    out = MessageOut.model_validate(msg).model_dump(mode="json")
    events.publish([friendship.user_a_id, friendship.user_b_id], "message_edited", out)
    return msg


@router.delete("/{friendship_id}/messages/{message_id}", status_code=204)
def delete_message(
    friendship_id: int,
    message_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    friendship = get_friendship(db, current.id, friendship_id)
    msg = _get_own_message(db, friendship, message_id, current.id)
    db.delete(msg)
    db.commit()
    events.publish(
        [friendship.user_a_id, friendship.user_b_id],
        "message_deleted",
        {"friendship_id": friendship_id, "id": message_id},
    )


@router.delete("/{friendship_id}/messages", status_code=204)
def clear_history(friendship_id: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    friendship = get_friendship(db, current.id, friendship_id)
    db.query(Message).filter(Message.friendship_id == friendship_id).delete()
    db.commit()
    events.publish(
        [friendship.user_a_id, friendship.user_b_id],
        "chat_cleared",
        {"friendship_id": friendship_id},
    )


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
