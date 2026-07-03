"""Shared dashboard: metadata + sticky notes (create, edit, move, delete)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import events
from ..database import get_db
from ..models import StickyNote, User
from ..schemas import StickyNoteCreate, StickyNoteOut, StickyNoteUpdate
from ..security import get_current_user
from ..services import dashboard_membership, friendship_members

router = APIRouter(prefix="/api/dashboards", tags=["dashboard"])


def _members(db: Session, dashboard) -> list[int]:
    from ..models import Friend

    friendship = db.get(Friend, dashboard.friendship_id)
    return friendship_members(friendship)


@router.get("/{dashboard_id}")
def get_dashboard(dashboard_id: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    dash = dashboard_membership(db, current.id, dashboard_id)
    notes = db.query(StickyNote).filter(StickyNote.dashboard_id == dashboard_id).all()
    return {
        "id": dash.id,
        "title": dash.title,
        "friendship_id": dash.friendship_id,
        "sticky_notes": [StickyNoteOut.model_validate(n).model_dump(mode="json") for n in notes],
    }


@router.post("/{dashboard_id}/notes", response_model=StickyNoteOut, status_code=201)
def create_note(
    dashboard_id: int,
    payload: StickyNoteCreate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dash = dashboard_membership(db, current.id, dashboard_id)
    note = StickyNote(
        dashboard_id=dashboard_id,
        author_id=current.id,
        content=payload.content,
        color=payload.color,
        pos_x=payload.pos_x,
        pos_y=payload.pos_y,
    )
    db.add(note)
    db.commit()
    out = StickyNoteOut.model_validate(note).model_dump(mode="json")
    events.publish(_members(db, dash), "note_created", out)
    return note


@router.patch("/{dashboard_id}/notes/{note_id}", response_model=StickyNoteOut)
def update_note(
    dashboard_id: int,
    note_id: int,
    payload: StickyNoteUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dash = dashboard_membership(db, current.id, dashboard_id)
    note = db.get(StickyNote, note_id)
    if not note or note.dashboard_id != dashboard_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.commit()
    out = StickyNoteOut.model_validate(note).model_dump(mode="json")
    events.publish(_members(db, dash), "note_updated", out)
    return note


@router.delete("/{dashboard_id}/notes/{note_id}", status_code=204)
def delete_note(
    dashboard_id: int,
    note_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dash = dashboard_membership(db, current.id, dashboard_id)
    note = db.get(StickyNote, note_id)
    if not note or note.dashboard_id != dashboard_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    db.delete(note)
    db.commit()
    events.publish(_members(db, dash), "note_deleted", {"id": note_id, "dashboard_id": dashboard_id})
