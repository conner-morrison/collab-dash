"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ---------- Auth ----------
class RegisterIn(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshIn(BaseModel):
    refresh_token: str


class VerifyIn(BaseModel):
    token: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=128)


# ---------- Users ----------
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    display_name: str
    avatar_color: str
    avatar_url: str | None = None
    is_verified: bool
    is_admin: bool = False
    show_email: bool = True
    created_at: datetime


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_name: str
    email: EmailStr | None = None  # hidden when the user opts out of showing it
    avatar_color: str
    avatar_url: str | None = None


class UpdateProfileIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    avatar_color: str | None = None
    show_email: bool | None = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


# ---------- Friends ----------
class FriendRequestOut(BaseModel):
    id: int
    status: str
    created_at: datetime
    sender: UserPublic
    receiver: UserPublic


class FriendshipOut(BaseModel):
    friendship_id: int
    dashboard_id: int
    friend: UserPublic
    created_at: datetime


class SendRequestIn(BaseModel):
    receiver_id: int


# ---------- Messages ----------
class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    friendship_id: int
    sender_id: int
    body: str
    is_read: bool
    edited_at: datetime | None = None
    created_at: datetime


class SendMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class EditMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


# ---------- Sticky notes ----------
class StickyNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    dashboard_id: int
    author_id: int
    content: str
    color: str
    pos_x: int
    pos_y: int
    updated_at: datetime


class StickyNoteCreate(BaseModel):
    content: str = ""
    color: str = "#fde68a"
    pos_x: int = 40
    pos_y: int = 40


class StickyNoteUpdate(BaseModel):
    content: str | None = None
    color: str | None = None
    pos_x: int | None = None
    pos_y: int | None = None


# ---------- Schedules ----------
class ScheduleReference(BaseModel):
    label: str = Field(default="", max_length=160)
    url: str = Field(min_length=1, max_length=2000)


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    dashboard_id: int
    author_id: int
    date: str
    time: str
    client: str
    task: str
    status: str
    reference_urls: list[ScheduleReference] = []

    @field_validator("reference_urls", mode="before")
    @classmethod
    def _default_refs(cls, v):
        return v or []


class ScheduleCreate(BaseModel):
    date: str
    time: str = "09:00"
    client: str = Field(min_length=1, max_length=160)
    task: str = ""
    status: str = "planned"
    reference_urls: list[ScheduleReference] = []


class ScheduleUpdate(BaseModel):
    date: str | None = None
    time: str | None = None
    client: str | None = None
    task: str | None = None
    status: str | None = None
    reference_urls: list[ScheduleReference] | None = None


# ---------- Notifications ----------
class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    type: str
    title: str
    body: str
    is_read: bool
    created_at: datetime
