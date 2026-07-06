"""Shared schedule table with By Date and By Client views."""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from datetime import date, timedelta

from .. import events
from ..database import get_db
from ..models import Friend, Schedule, SharedDashboard, User
from ..schemas import ScheduleCreate, ScheduleOut, ScheduleUpdate
from ..security import get_current_user
from ..services import dashboard_membership, friendship_members

router = APIRouter(prefix="/api/dashboards", tags=["schedule"])
upcoming_router = APIRouter(prefix="/api/schedules", tags=["schedule"])


@upcoming_router.get("/upcoming")
def upcoming_schedules(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """All schedule entries across the user's workspaces from ~today onward.

    Used by the client-side meeting reminder; precise timing is computed in the
    browser's local timezone, so this only coarsely filters by date.
    """
    friendships = (
        db.query(Friend)
        .filter((Friend.user_a_id == current.id) | (Friend.user_b_id == current.id))
        .all()
    )
    dashboards = (
        db.query(SharedDashboard)
        .filter(SharedDashboard.friendship_id.in_([f.id for f in friendships]))
        .all()
    )
    dash_ids = [d.id for d in dashboards]
    if not dash_ids:
        return {"items": []}

    cutoff = (date.today() - timedelta(days=1)).isoformat()
    rows = (
        db.query(Schedule)
        .filter(Schedule.dashboard_id.in_(dash_ids), Schedule.date >= cutoff)
        .all()
    )
    return {"items": [ScheduleOut.model_validate(r).model_dump(mode="json") for r in rows]}


def _members(db: Session, dashboard) -> list[int]:
    from ..models import Friend

    return friendship_members(db.get(Friend, dashboard.friendship_id))


@router.get("/{dashboard_id}/schedules")
def list_schedules(
    dashboard_id: int,
    view: str = Query("date", pattern="^(date|client)$"),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dashboard_membership(db, current.id, dashboard_id)
    rows = db.query(Schedule).filter(Schedule.dashboard_id == dashboard_id).all()
    items = [ScheduleOut.model_validate(r).model_dump(mode="json") for r in rows]

    key = "date" if view == "date" else "client"
    groups: dict[str, list] = defaultdict(list)
    for item in items:
        groups[item[key]].append(item)
    for g in groups.values():
        g.sort(key=lambda x: (x["date"], x["time"]))

    grouped = [
        {"key": k, "items": v}
        for k, v in sorted(groups.items(), key=lambda kv: kv[0])
    ]
    return {"view": view, "groups": grouped, "items": items}


@router.post("/{dashboard_id}/schedules", response_model=ScheduleOut, status_code=201)
def create_schedule(
    dashboard_id: int,
    payload: ScheduleCreate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dash = dashboard_membership(db, current.id, dashboard_id)
    row = Schedule(dashboard_id=dashboard_id, author_id=current.id, **payload.model_dump())
    db.add(row)
    db.commit()
    out = ScheduleOut.model_validate(row).model_dump(mode="json")
    events.publish(_members(db, dash), "schedule_created", out)
    return row


@router.patch("/{dashboard_id}/schedules/{schedule_id}", response_model=ScheduleOut)
def update_schedule(
    dashboard_id: int,
    schedule_id: int,
    payload: ScheduleUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dash = dashboard_membership(db, current.id, dashboard_id)
    row = db.get(Schedule, schedule_id)
    if not row or row.dashboard_id != dashboard_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule entry not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    out = ScheduleOut.model_validate(row).model_dump(mode="json")
    events.publish(_members(db, dash), "schedule_updated", out)
    return row


@router.delete("/{dashboard_id}/schedules/{schedule_id}", status_code=204)
def delete_schedule(
    dashboard_id: int,
    schedule_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dash = dashboard_membership(db, current.id, dashboard_id)
    row = db.get(Schedule, schedule_id)
    if not row or row.dashboard_id != dashboard_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule entry not found")
    db.delete(row)
    db.commit()
    events.publish(_members(db, dash), "schedule_deleted", {"id": schedule_id, "dashboard_id": dashboard_id})
