"""Client channel — clients tracked within a shared workspace."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import events
from ..database import get_db
from ..models import Client, Friend, User
from ..schemas import ClientCreate, ClientOut, ClientUpdate
from ..security import get_current_user
from ..services import dashboard_membership, friendship_members

router = APIRouter(prefix="/api/dashboards", tags=["clients"])


def _members(db: Session, dashboard) -> list[int]:
    return friendship_members(db.get(Friend, dashboard.friendship_id))


@router.get("/{dashboard_id}/clients")
def list_clients(
    dashboard_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dashboard_membership(db, current.id, dashboard_id)
    rows = (
        db.query(Client)
        .filter(Client.dashboard_id == dashboard_id)
        .order_by(Client.created_at.desc())
        .all()
    )
    return {"items": [ClientOut.model_validate(r).model_dump(mode="json") for r in rows]}


@router.post("/{dashboard_id}/clients", response_model=ClientOut, status_code=201)
def create_client(
    dashboard_id: int,
    payload: ClientCreate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dash = dashboard_membership(db, current.id, dashboard_id)
    row = Client(dashboard_id=dashboard_id, author_id=current.id, **payload.model_dump())
    db.add(row)
    db.commit()
    out = ClientOut.model_validate(row).model_dump(mode="json")
    events.publish(_members(db, dash), "client_created", out)
    return row


@router.patch("/{dashboard_id}/clients/{client_id}", response_model=ClientOut)
def update_client(
    dashboard_id: int,
    client_id: int,
    payload: ClientUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dash = dashboard_membership(db, current.id, dashboard_id)
    row = db.get(Client, client_id)
    if not row or row.dashboard_id != dashboard_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    out = ClientOut.model_validate(row).model_dump(mode="json")
    events.publish(_members(db, dash), "client_updated", out)
    return row


@router.delete("/{dashboard_id}/clients/{client_id}", status_code=204)
def delete_client(
    dashboard_id: int,
    client_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dash = dashboard_membership(db, current.id, dashboard_id)
    row = db.get(Client, client_id)
    if not row or row.dashboard_id != dashboard_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    db.delete(row)
    db.commit()
    events.publish(_members(db, dash), "client_deleted", {"id": client_id, "dashboard_id": dashboard_id})
