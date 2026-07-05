"""User search, friend requests, and friendships."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import events
from ..database import get_db
from ..models import Friend, FriendRequest, FriendRequestStatus, User
from ..schemas import (
    FriendRequestOut,
    FriendshipOut,
    SendRequestIn,
    UserPublic,
)
from ..security import get_current_user
from ..services import (
    audit,
    create_friendship,
    dashboard_for_friendship,
    existing_friendship,
    notify,
    other_member,
    public_user,
    search_users,
)

router = APIRouter(prefix="/api", tags=["friends"])


def _public(u: User) -> dict:
    return public_user(u)


@router.get("/users/search", response_model=list[UserPublic])
def search(q: str = Query(min_length=1), current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [public_user(u) for u in search_users(db, q, current.id)]


@router.post("/friend-requests", status_code=status.HTTP_201_CREATED)
def send_request(payload: SendRequestIn, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.receiver_id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot friend yourself")
    receiver = db.get(User, payload.receiver_id)
    if not receiver:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if existing_friendship(db, current.id, receiver.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "You are already friends")

    # If the receiver already sent *me* a request, accept it instead of duplicating.
    reverse = (
        db.query(FriendRequest)
        .filter(
            FriendRequest.sender_id == receiver.id,
            FriendRequest.receiver_id == current.id,
            FriendRequest.status == FriendRequestStatus.pending,
        )
        .first()
    )
    if reverse:
        return _accept(db, reverse, current)

    existing = (
        db.query(FriendRequest)
        .filter(FriendRequest.sender_id == current.id, FriendRequest.receiver_id == receiver.id)
        .first()
    )
    if existing and existing.status == FriendRequestStatus.pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "Request already sent")
    if existing:
        existing.status = FriendRequestStatus.pending
        req = existing
    else:
        req = FriendRequest(sender_id=current.id, receiver_id=receiver.id)
        db.add(req)
    db.flush()
    notify(db, receiver.id, "friend_request", "New friend request", f"{current.display_name} wants to connect")
    audit(db, current.id, "friend_request_sent", receiver.email)
    db.commit()
    events.publish([receiver.id], "friend_request_received", {"from": _public(current)})
    return {"id": req.id, "status": req.status.value}


def _accept(db: Session, req: FriendRequest, current: User) -> dict:
    req.status = FriendRequestStatus.accepted
    friendship = create_friendship(db, req.sender_id, req.receiver_id)
    sender = db.get(User, req.sender_id)
    notify(db, sender.id, "friend_accepted", "Friend request accepted", f"{current.display_name} accepted your request")
    audit(db, current.id, "friend_request_accepted", sender.email)
    db.commit()
    events.publish(
        [req.sender_id, req.receiver_id],
        "friendship_created",
        {"friendship_id": friendship.id},
    )
    return {"friendship_id": friendship.id, "status": "accepted"}


@router.get("/friend-requests", response_model=list[FriendRequestOut])
def list_requests(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    reqs = (
        db.query(FriendRequest)
        .filter(
            or_(FriendRequest.sender_id == current.id, FriendRequest.receiver_id == current.id),
            FriendRequest.status == FriendRequestStatus.pending,
        )
        .order_by(FriendRequest.created_at.desc())
        .all()
    )
    return [
        FriendRequestOut(
            id=r.id,
            status=r.status.value,
            created_at=r.created_at,
            sender=public_user(r.sender),
            receiver=public_user(r.receiver),
        )
        for r in reqs
    ]


@router.post("/friend-requests/{request_id}/accept")
def accept_request(request_id: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    req = db.get(FriendRequest, request_id)
    if not req or req.receiver_id != current.id or req.status != FriendRequestStatus.pending:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return _accept(db, req, current)


@router.post("/friend-requests/{request_id}/decline")
def decline_request(request_id: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    req = db.get(FriendRequest, request_id)
    if not req or req.receiver_id != current.id or req.status != FriendRequestStatus.pending:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    req.status = FriendRequestStatus.declined
    audit(db, current.id, "friend_request_declined")
    db.commit()
    return {"status": "declined"}


@router.get("/friends", response_model=list[FriendshipOut])
def list_friends(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    friendships = (
        db.query(Friend)
        .filter(or_(Friend.user_a_id == current.id, Friend.user_b_id == current.id))
        .order_by(Friend.created_at.desc())
        .all()
    )
    result = []
    for f in friendships:
        friend = db.get(User, other_member(f, current.id))
        dash = dashboard_for_friendship(db, f.id)
        result.append(
            FriendshipOut(
                friendship_id=f.id,
                dashboard_id=dash.id,
                friend=public_user(friend),
                created_at=f.created_at,
            )
        )
    return result
