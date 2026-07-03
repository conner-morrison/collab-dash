# Collaborative Project Dashboard

A real-time collaborative web app where users authenticate, connect as friends, chat,
share a dashboard, manage sticky notes, and maintain schedules — all with **live
WebSocket synchronization**.

Built to the attached requirements specification.

![Stack](https://img.shields.io/badge/frontend-Next.js%2014%20%2B%20TypeScript%20%2B%20Tailwind-000?logo=next.js)
![Stack](https://img.shields.io/badge/backend-FastAPI%20%2B%20SQLAlchemy-009688?logo=fastapi)

---

## ✨ Features

| Requirement | Status |
|---|---|
| Email/password auth with email verification, password reset, JWT + refresh tokens | ✅ |
| User search & friend requests; acceptance creates a friendship | ✅ |
| Private 1:1 messaging with read receipts & live updates | ✅ |
| Shared dashboard per friendship | ✅ |
| Sticky notes — create, edit, **drag to move**, delete | ✅ |
| Shared schedule table | ✅ |
| Schedule views: **By Date** and **By Client** | ✅ |
| Real-time updates over WebSockets | ✅ |
| Notifications & alerts for important events | ✅ |
| Presence (online/offline) indicators | ✅ (bonus) |

All nine required entities are modelled: **Users, FriendRequests, Friends, Messages,
SharedDashboards, StickyNotes, Schedules, Notifications, AuditLogs.**

---

## 🏗️ Architecture

```
┌────────────────────┐        REST (JWT)         ┌───────────────────────────┐
│  Next.js frontend  │  ───────────────────────▶ │        FastAPI API         │
│  React + TS + TW   │  ◀────── WebSocket ──────▶ │  auth · friends · chat ·  │
└────────────────────┘        (live events)       │  dashboard · schedule ·   │
                                                   │  notifications            │
                                                   └───────────┬───────────────┘
                                                               │
                                          ┌────────────────────┴───────────┐
                                          │  SQLAlchemy ORM  →  Database    │
                                          │  (SQLite dev / PostgreSQL prod) │
                                          └─────────────────────────────────┘

Realtime layer: a pub/sub abstraction (`app/realtime.py`) fans events out to each
user's live sockets. It uses an in-process broadcaster by default; the same interface
is where Redis Pub/Sub plugs in for multi-instance deployments.
```

The backend is organised into the services named in the spec — Authentication, Friends,
Chat, Dashboard, Schedule, and Notification — as separate routers under
[`backend/app/routers/`](backend/app/routers).

---

## 🚀 Quick start (local, zero infrastructure)

The project runs with **no database or Redis to install** — it defaults to a local
SQLite file and an in-process realtime bus.

### 1. Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python seed.py                 # creates demo users + sample data
uvicorn app.main:app --reload --port 8010
```

API is now on **http://localhost:8010** (interactive docs at `/docs`).

### 2. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

App is now on **http://localhost:3000**.

### 3. Log in

Two demo accounts are seeded (already email-verified):

| Email | Password |
|---|---|
| `alice@demo.dev` | `password123` |
| `bob@demo.dev`   | `password123` |

Open two browsers (or a normal + incognito window), sign in as each, open the shared
workspace, and watch chat, sticky notes, schedules, and presence update **live**.

> **Try it new:** register a fresh account. Because there's no SMTP in local dev, the
> verification and password-reset tokens are surfaced right in the UI so you can
> complete the flow without an inbox.

---

## 🐳 Run the full stack with Docker

This brings up PostgreSQL, Redis, the API, and the frontend:

```bash
docker compose up --build
# frontend → http://localhost:3000   api → http://localhost:8010
```

Seed demo data into the container once it's up:

```bash
docker compose exec backend python seed.py
```

---

## ⚙️ Configuration

Backend settings are read from the environment (see [`backend/.env.example`](backend/.env.example)):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./dashboard.db` | SQLite locally, PostgreSQL DSN in prod |
| `JWT_SECRET` | dev placeholder | **set a strong value in production** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | refresh token lifetime |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS origin |
| `BROADCASTER` | `memory` | `memory` or `redis` |

Frontend reads `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` (see
[`frontend/.env.local`](frontend/.env.local)).

---

## 📁 Project layout

```
backend/
  app/
    main.py            FastAPI app + router wiring + lifespan
    config.py          env-driven settings
    database.py        engine + session
    models.py          all 9 ORM entities
    schemas.py         Pydantic request/response models
    security.py        password hashing + JWT
    realtime.py        WebSocket connection manager (pub/sub abstraction)
    events.py          sync→async bridge for publishing events
    services.py        shared helpers (friendships, notifications, audit)
    routers/           auth, friends, chat, dashboard, schedule, notifications, ws
  seed.py              demo data
frontend/
  app/                 Next.js App Router pages (auth + /app workspace)
  components/          UI: Avatar, Toast, Sidebar, NotificationBell, workspace panels
  lib/                 api client, auth context, websocket context, app data store
docker-compose.yml     Postgres + Redis + backend + frontend
```

---

## 🔒 Notes on scope & production mapping

This is a complete, runnable implementation of the spec. A few pragmatic choices keep it
easy to run while staying faithful to the intended production stack:

- **Database** — SQLite by default for zero-setup; swap `DATABASE_URL` to PostgreSQL
  (the ORM is database-agnostic; `docker compose` uses Postgres).
- **Realtime** — an in-process broadcaster behind a clean interface; Redis Pub/Sub drops
  in at `app/realtime.py` for horizontal scaling (`BROADCASTER=redis`).
- **Email** — verification & reset tokens are logged / returned in dev instead of emailed;
  point `_deliver()` in `routers/auth.py` at a transactional-email provider for prod.
- **Audit logs** are written for security-relevant actions (register, login, requests, etc.).

## 🔮 Future enhancements (from the spec)

Group collaboration · file sharing · calendar sync · AI assistant · mobile app ·
role-based permissions.
