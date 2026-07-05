"""Self-service profile management: update your own profile and password."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import ChangePasswordIn, UpdateProfileIn, UserOut
from ..security import get_current_user, hash_password, verify_password
from ..services import audit

router = APIRouter(prefix="/api/users", tags=["profile"])

# Palette offered in the UI; other values are still accepted if sent.
AVATAR_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6", "#0ea5e9"]


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UpdateProfileIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.display_name is not None:
        current.display_name = payload.display_name

    if payload.email is not None and payload.email != current.email:
        clash = db.query(User).filter(User.email == payload.email, User.id != current.id).first()
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, "That email is already in use")
        current.email = payload.email

    if payload.avatar_color is not None:
        current.avatar_color = payload.avatar_color

    if payload.show_email is not None:
        current.show_email = payload.show_email

    audit(db, current.id, "profile_update")
    db.commit()
    db.refresh(current)
    return current


@router.post("/me/password")
def change_password(
    payload: ChangePasswordIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    current.hashed_password = hash_password(payload.new_password)
    audit(db, current.id, "password_change")
    db.commit()
    return {"message": "Password updated"}
