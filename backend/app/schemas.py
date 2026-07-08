"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class _NormalizesEmail(BaseModel):
    """Mixin: trim + lowercase the `email` field so casing/whitespace can't
    create or miss an account (e.g. Alice@Demo.dev == alice@demo.dev)."""

    @field_validator("email", mode="before", check_fields=False)
    @classmethod
    def _normalize_email(cls, v):
        return v.strip().lower() if isinstance(v, str) else v


# ---------- Auth ----------
class RegisterIn(_NormalizesEmail):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(_NormalizesEmail):
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


class ForgotPasswordIn(_NormalizesEmail):
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
    reminder_lead_minutes: int = 30
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
    reminder_lead_minutes: int | None = None

    @field_validator("reminder_lead_minutes")
    @classmethod
    def _valid_lead(cls, v):
        if v is not None and v not in (0, 10, 15, 30, 60):
            raise ValueError("reminder_lead_minutes must be one of 0, 10, 15, 30, 60")
        return v


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
    note: str = ""
    result: str = ""
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
    note: str = ""
    result: str = ""
    reference_urls: list[ScheduleReference] = []


class ScheduleUpdate(BaseModel):
    date: str | None = None
    time: str | None = None
    client: str | None = None
    task: str | None = None
    status: str | None = None
    note: str | None = None
    result: str | None = None
    reference_urls: list[ScheduleReference] | None = None


# ---------- Clients ----------
class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    dashboard_id: int
    author_id: int
    name: str
    company: str = ""
    status: str
    type: str
    title: str = ""
    source: str
    introducer: str = ""


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    company: str = Field(default="", max_length=200)
    status: str = "screening"
    type: str = "job"
    title: str = Field(default="", max_length=300)
    source: str = "upwork"
    introducer: str = Field(default="", max_length=200)


class ClientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    company: str | None = None
    status: str | None = None
    type: str | None = None
    title: str | None = None
    source: str | None = None
    introducer: str | None = None


# ---------- Notifications ----------
class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    type: str
    title: str
    body: str
    is_read: bool
    created_at: datetime
