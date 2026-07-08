"""FastAPI application entrypoint.

Wires together the Authentication, Friends, Chat, Dashboard, Schedule, and
Notification services, plus the WebSocket realtime endpoint.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import events
from .bootstrap import ensure_admin, run_migrations
from .config import settings
from .database import Base, engine
from .routers import admin, auth, chat, clients, dashboard, friends, notifications, profile, schedule, ws

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)
    ensure_admin()
    events.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(friends.router)
app.include_router(chat.router)
app.include_router(dashboard.router)
app.include_router(schedule.router)
app.include_router(schedule.upcoming_router)
app.include_router(clients.router)
app.include_router(notifications.router)
app.include_router(profile.router)
app.include_router(admin.router)
app.include_router(ws.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment}
