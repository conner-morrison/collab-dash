"""Authentication: register, email verification, login, refresh, password reset.

Verification and reset emails are sent via SendGrid when configured (see
app/mailer.py). Without SendGrid, the token is logged and returned in the API
response outside production, so the flow still works in development.
"""
from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import mailer
from ..config import settings
from ..database import get_db
from ..models import User
from ..schemas import (
    ForgotPasswordIn,
    LoginIn,
    RefreshIn,
    RegisterIn,
    ResetPasswordIn,
    TokenPair,
    UserOut,
    VerifyIn,
)
from ..security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    new_token,
    verify_password,
)
from ..services import audit, display_name_taken

log = logging.getLogger("auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

AVATAR_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6"]


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    if display_name_taken(db, payload.display_name):
        raise HTTPException(status.HTTP_409_CONFLICT, "That display name is already taken")

    token = new_token()
    user = User(
        email=payload.email,
        display_name=payload.display_name,
        hashed_password=hash_password(payload.password),
        avatar_color=random.choice(AVATAR_COLORS),
        verification_token=token,
        is_verified=False,
    )
    db.add(user)
    db.flush()
    audit(db, user.id, "register", payload.email)
    db.commit()
    # Send the verification email in the background so the response isn't blocked.
    background.add_task(mailer.send_verification_email, payload.email, token)
    # dev_token is exposed only outside production so the UI can auto-verify.
    return {
        "message": "Registered. Check your email to verify your account.",
        "dev_verification_token": token if settings.environment != "production" else None,
    }


@router.post("/verify")
def verify_email(payload: VerifyIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.verification_token == payload.token).first()
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification token")
    user.is_verified = True
    user.verification_token = None
    audit(db, user.id, "verify_email")
    db.commit()
    return {"message": "Email verified. You can now log in."}


@router.post("/login", response_model=TokenPair)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Please verify your email before logging in")
    user.last_seen = datetime.now(timezone.utc)
    audit(db, user.id, "login")
    db.commit()
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshIn, db: Session = Depends(get_db)):
    user_id = decode_token(payload.refresh_token, "refresh")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    dev_token = None
    if user:
        token = new_token()
        user.reset_token = token
        user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        background.add_task(mailer.send_reset_email, user.email, token)
        if settings.environment != "production":
            dev_token = token
    # Always return success to avoid leaking which emails are registered.
    return {"message": "If that email exists, a reset link has been sent.", "dev_reset_token": dev_token}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == payload.token).first()
    if not user or not user.reset_token_expires:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid reset token")
    expires = user.reset_token_expires
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reset token has expired")
    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    audit(db, user.id, "reset_password")
    db.commit()
    return {"message": "Password updated. You can now log in."}


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return current
