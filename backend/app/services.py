"""Shared service helpers used across routers."""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from . import events
from .models import AuditLog, Friend, Notification, SharedDashboard, User


def public_user(u: User) -> dict:
    """Serialize a user for OTHER users, hiding the email if they opted out."""
    return {
        "id": u.id,
        "display_name": u.display_name,
        "email": u.email if u.show_email else None,
        "avatar_color": u.avatar_color,
        "avatar_url": u.avatar_url,
    }


def canonical_pair(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def get_friendship(db: Session, user_id: int, friendship_id: int) -> Friend:
    """Fetch a friendship, ensuring `user_id` is a member of it."""
    friendship = db.get(Friend, friendship_id)
    if not friendship or user_id not in (friendship.user_a_id, friendship.user_b_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Friendship not found")
    return friendship


def friendship_members(friendship: Friend) -> list[int]:
    return [friendship.user_a_id, friendship.user_b_id]


def other_member(friendship: Friend, user_id: int) -> int:
    return friendship.user_b_id if friendship.user_a_id == user_id else friendship.user_a_id


def dashboard_for_friendship(db: Session, friendship_id: int) -> SharedDashboard:
    dash = db.query(SharedDashboard).filter(SharedDashboard.friendship_id == friendship_id).first()
    if not dash:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dashboard not found")
    return dash


def dashboard_membership(db: Session, user_id: int, dashboard_id: int) -> SharedDashboard:
    dash = db.get(SharedDashboard, dashboard_id)
    if not dash:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dashboard not found")
    get_friendship(db, user_id, dash.friendship_id)  # authorization check
    return dash


def existing_friendship(db: Session, a: int, b: int) -> Friend | None:
    lo, hi = canonical_pair(a, b)
    return (
        db.query(Friend)
        .filter(Friend.user_a_id == lo, Friend.user_b_id == hi)
        .first()
    )


def create_friendship(db: Session, a: int, b: int) -> Friend:
    lo, hi = canonical_pair(a, b)
    friendship = Friend(user_a_id=lo, user_b_id=hi)
    db.add(friendship)
    db.flush()
    dashboard = SharedDashboard(friendship_id=friendship.id, title="Shared Dashboard")
    db.add(dashboard)
    db.flush()
    return friendship


def notify(db: Session, user_id: int, ntype: str, title: str, body: str = "") -> Notification:
    """Persist a notification and push it in real time."""
    note = Notification(user_id=user_id, type=ntype, title=title, body=body)
    db.add(note)
    db.flush()
    events.publish(
        [user_id],
        "notification",
        {
            "id": note.id,
            "type": note.type,
            "title": note.title,
            "body": note.body,
            "is_read": note.is_read,
            "created_at": note.created_at.isoformat(),
        },
    )
    return note


def audit(db: Session, user_id: int | None, action: str, detail: str = "") -> None:
    db.add(AuditLog(user_id=user_id, action=action, detail=detail))


def search_users(db: Session, query: str, exclude_id: int, limit: int = 20) -> list[User]:
    like = f"%{query.strip()}%"
    return (
        db.query(User)
        .filter(User.id != exclude_id)
        .filter(or_(User.display_name.ilike(like), User.email.ilike(like)))
        .limit(limit)
        .all()
    )
