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
from .config import settings
from .database import Base, engine
from .routers import auth, chat, dashboard, friends, notifications, schedule, ws

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
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
app.include_router(notifications.router)
app.include_router(ws.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment}
