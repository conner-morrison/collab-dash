"""Admin console API.

Generic view / add / edit / delete over every database table, driven by
SQLAlchemy model introspection so all nine entities are covered by one code
path. Every route requires an admin user (`get_current_admin`).
"""
from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AuditLog,
    Friend,
    FriendRequest,
    Message,
    Notification,
    Schedule,
    SharedDashboard,
    StickyNote,
    User,
)
from ..security import get_current_admin, hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])

# Ordered so the console lists tables logically.
REGISTRY: dict[str, type] = {
    "users": User,
    "friend_requests": FriendRequest,
    "friends": Friend,
    "shared_dashboards": SharedDashboard,
    "messages": Message,
    "sticky_notes": StickyNote,
    "schedules": Schedule,
    "notifications": Notification,
    "audit_logs": AuditLog,
}

# Columns the client should never send values for (server-managed).
READONLY_COLUMNS = {"id", "created_at", "updated_at"}
# Never expose the password hash to the console.
HIDDEN_COLUMNS = {"hashed_password", "verification_token", "reset_token"}


def _model_or_404(table: str) -> type:
    model = REGISTRY.get(table)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown table '{table}'")
    return model


def _serialize(obj: Any) -> dict:
    out: dict[str, Any] = {}
    for column in obj.__table__.columns:
        if column.name in HIDDEN_COLUMNS:
            continue
        value = getattr(obj, column.name)
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        elif isinstance(value, enum.Enum):
            value = value.value
        out[column.name] = value
    return out


def _column_meta(model: type) -> list[dict]:
    meta = []
    for column in model.__table__.columns:
        if column.name in HIDDEN_COLUMNS:
            continue
        try:
            pytype = column.type.python_type.__name__
        except (NotImplementedError, AttributeError):
            pytype = "str"
        meta.append(
            {
                "name": column.name,
                "type": pytype,
                "nullable": column.nullable,
                "primary_key": column.primary_key,
                "readonly": column.name in READONLY_COLUMNS or column.primary_key,
            }
        )
    return meta


def _coerce(model: type, field: str, value: Any) -> Any:
    column = model.__table__.columns.get(field)
    if column is None or value is None or value == "":
        return None if value == "" else value
    # Enum columns: map the incoming string to the enum member by value.
    enum_class = getattr(column.type, "enum_class", None)
    if enum_class is not None:
        return enum_class(value)
    try:
        pytype = column.type.python_type
    except (NotImplementedError, AttributeError):
        return value
    if pytype is bool:
        return value in (True, "true", "True", "1", 1)
    if pytype is int:
        return int(value)
    if pytype is float:
        return float(value)
    if pytype is datetime and isinstance(value, str):
        return datetime.fromisoformat(value)
    return value


def _apply_payload(model: type, obj: Any, payload: dict, *, creating: bool) -> None:
    # Convenience: a "password" field on users is hashed into hashed_password.
    if model is User and payload.get("password"):
        obj.hashed_password = hash_password(payload["password"])

    for field, value in payload.items():
        if field == "password":
            continue
        if field not in model.__table__.columns:
            continue
        if field in READONLY_COLUMNS:
            continue
        setattr(obj, field, _coerce(model, field, value))


@router.get("/tables")
def list_tables(db: Session = Depends(get_db)):
    """List every table with its column schema and current row count."""
    result = []
    for name, model in REGISTRY.items():
        result.append(
            {
                "name": name,
                "count": db.query(func.count()).select_from(model).scalar(),
                "columns": _column_meta(model),
                "supports_password": model is User,
            }
        )
    return result


@router.get("/tables/{table}")
def list_rows(
    table: str,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    model = _model_or_404(table)
    pk = list(model.__table__.primary_key.columns)[0]
    total = db.query(func.count()).select_from(model).scalar()
    rows = db.query(model).order_by(pk.desc()).offset(offset).limit(limit).all()
    return {
        "table": table,
        "total": total,
        "columns": _column_meta(model),
        "rows": [_serialize(r) for r in rows],
    }


@router.post("/tables/{table}", status_code=status.HTTP_201_CREATED)
def create_row(table: str, payload: dict, db: Session = Depends(get_db)):
    model = _model_or_404(table)
    obj = model()
    try:
        _apply_payload(model, obj, payload, creating=True)
        db.add(obj)
        db.commit()
        db.refresh(obj)
    except Exception as exc:  # surface DB/constraint errors to the console
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return _serialize(obj)


@router.patch("/tables/{table}/{row_id}")
def update_row(table: str, row_id: int, payload: dict, db: Session = Depends(get_db)):
    model = _model_or_404(table)
    obj = db.get(model, row_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Row not found")
    try:
        _apply_payload(model, obj, payload, creating=False)
        db.commit()
        db.refresh(obj)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return _serialize(obj)


@router.delete("/tables/{table}/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_row(
    table: str,
    row_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    model = _model_or_404(table)
    obj = db.get(model, row_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Row not found")
    # Guard against the admin deleting their own account and locking themselves out.
    if model is User and obj.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own admin account")
    try:
        db.delete(obj)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
