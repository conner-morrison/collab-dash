# Deploy guide — Vercel (frontend) + Railway (backend + Postgres)

This app splits across two hosts because Vercel runs **stateless serverless functions**
and cannot hold the persistent **WebSocket** connections the real-time features need:

```
   Browser
     │  https  (REST + wss WebSocket)
     ▼
┌──────────────┐        ┌─────────────────────────────┐
│   Vercel     │        │           Railway           │
│  Next.js UI  │ ─────▶ │  FastAPI (Docker)  ──▶  Postgres  │
└──────────────┘        └─────────────────────────────┘
```

- **Frontend (Next.js)** → Vercel
- **Backend (FastAPI + WebSockets, Dockerfile)** → Railway
- **Database (Postgres)** → Railway plugin (same project)

> Prerequisite: push this repo to GitHub. Both Vercel and Railway deploy from a repo.

---

## Order of operations (avoids the chicken-and-egg between the two URLs)

1. Create Postgres on Railway
2. Deploy the backend on Railway → get its public URL
3. Deploy the frontend on Vercel with that backend URL → get the Vercel URL
4. Set `FRONTEND_ORIGIN` on the backend to the Vercel URL → redeploy backend
5. Seed + verify

---

## 1. Postgres on Railway

1. Create a new project at [railway.app](https://railway.app) → **New Project**.
2. **+ New → Database → Add PostgreSQL**.
3. Done — Railway exposes a `DATABASE_URL` on this Postgres service that you'll
   reference from the backend in the next step. No manual schema step is needed:
   the app auto-creates all tables on startup (`Base.metadata.create_all`).

---

## 2. Backend (FastAPI) on Railway

1. In the same project: **+ New → GitHub Repo** → select this repo.
2. Open the new service → **Settings**:
   - **Root Directory**: `backend`  ← so Railway builds `backend/Dockerfile`
   - **Build**: Railway auto-detects the Dockerfile (nothing to configure).
3. **Settings → Networking → Generate Domain** to get a public HTTPS URL, e.g.
   `https://collab-backend-production.up.railway.app`.
   Railway also injects a `PORT` env var; the Dockerfile already binds to it.
4. **Variables** tab — add these (see the reference table below). The DB one uses
   Railway's reference syntax so it always tracks the Postgres service:

   | Variable | Value |
   |---|---|
   | `ENVIRONMENT` | `production` |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `JWT_SECRET` | *(generate — see below)* |
   | `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` |
   | `REFRESH_TOKEN_EXPIRE_DAYS` | `7` |
   | `FRONTEND_ORIGIN` | `https://REPLACE-AFTER-STEP-3.vercel.app` |
   | `BROADCASTER` | `memory` |

   Generate a strong secret locally and paste the output:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   # or: openssl rand -base64 48
   ```
   > `PORT` is provided automatically by Railway — **do not set it yourself.**
   > `DATABASE_URL` arrives as `postgresql://…`, which the backend uses directly
   > (the config also normalizes a legacy `postgres://` scheme, just in case).

5. Deploy. When it's live, check health:
   ```bash
   curl https://<your-backend>.up.railway.app/api/health
   # {"status":"ok","app":"Collaborative Project Dashboard","environment":"production"}
   ```

6. **Seed demo data** (one-off). In the service's shell (Railway → service →
   the `⋮`/terminal, or `railway run` via the CLI):
   ```bash
   python seed.py
   ```
   Creates `alice@demo.dev` / `password123` and `bob@demo.dev` / `password123`.

---

## 3. Frontend (Next.js) on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import this repo.
2. **Root Directory**: `frontend`. Framework preset: **Next.js** (auto-detected).
3. **Environment Variables** — add both (these are baked in at build time, so they
   must be present before the first build):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<your-backend>.up.railway.app` |
   | `NEXT_PUBLIC_WS_URL` | `wss://<your-backend>.up.railway.app` |

   > Note the schemes: **`https`** for the API and **`wss`** (secure WebSocket) for
   > the socket — plain `ws://` will be blocked as mixed content on an HTTPS page.
   > No trailing slashes.

4. **Deploy.** Vercel gives you `https://<your-app>.vercel.app`.

---

## 4. Close the CORS loop

The backend only accepts requests from the origin in `FRONTEND_ORIGIN`.

1. Back on Railway → backend service → **Variables**:
   - Set `FRONTEND_ORIGIN` = `https://<your-app>.vercel.app` (exact, no trailing slash).
2. Redeploy the backend (Railway redeploys on variable change automatically).

> If you later add a **custom domain** on Vercel, update `FRONTEND_ORIGIN` to match it.
> Vercel **preview** deployments get unique URLs that won't be in CORS — test against
> the production domain, or widen CORS (see troubleshooting).

---

## 5. Verify end-to-end

1. Open `https://<your-app>.vercel.app` → sign in as `alice@demo.dev` / `password123`.
2. Open an incognito window → sign in as `bob@demo.dev`.
3. Open the shared workspace in both. Send a chat message from one → it should appear
   in the other instantly, presence should flip to "Online", and the notification bell
   should update — all without reloading. That confirms REST **and** the `wss` socket
   are both wired correctly.

---

## Full environment variable reference

### Backend — Railway
| Variable | Example | Required | Purpose |
|---|---|:--:|---|
| `ENVIRONMENT` | `production` | – | Hides dev-only tokens in auth responses |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | ✅ | Postgres DSN (Railway reference) |
| `JWT_SECRET` | 64-char random string | ✅ | Signs access/refresh tokens |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | – | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | – | Refresh token lifetime |
| `FRONTEND_ORIGIN` | `https://app.vercel.app` | ✅ | CORS allow-origin |
| `BROADCASTER` | `memory` | – | `memory` (single instance) or `redis` |
| `REDIS_URL` | `redis://…` | only if `BROADCASTER=redis` | Pub/Sub bus |
| `PORT` | *(auto)* | – | **Injected by Railway — don't set** |

### Frontend — Vercel
| Variable | Example | Required | Purpose |
|---|---|:--:|---|
| `NEXT_PUBLIC_API_URL` | `https://backend.up.railway.app` | ✅ | REST base URL |
| `NEXT_PUBLIC_WS_URL` | `wss://backend.up.railway.app` | ✅ | WebSocket base URL |

---

## Troubleshooting

- **CORS errors in the browser console** → `FRONTEND_ORIGIN` doesn't exactly match the
  Vercel origin (scheme, subdomain, or a stray trailing slash). Fix and redeploy backend.
- **WebSocket fails / no live updates** → ensure `NEXT_PUBLIC_WS_URL` uses `wss://`
  (not `ws://`) and points at the Railway domain. Rebuild the frontend after changing it
  (Vercel bakes `NEXT_PUBLIC_*` at build time — a redeploy is required, not just a var edit).
- **Backend won't start / "port" errors** → don't hardcode a port; Railway sets `PORT` and
  the Dockerfile already binds `--port ${PORT:-8000}`.
- **`Can't load plugin: sqlalchemy.dialects:postgres`** → an old `postgres://` URL; the
  config auto-rewrites it to `postgresql://`, but confirm `DATABASE_URL` is set from the
  Postgres service and not a hand-typed legacy value.
- **Env var changes don't take effect on the frontend** → `NEXT_PUBLIC_*` are compile-time.
  Trigger a fresh Vercel deploy after editing them.

---

## Scaling note (when you outgrow one instance)

`BROADCASTER=memory` fans WebSocket events out **within a single backend process**. If you
scale Railway to 2+ replicas (or a host that autoscales), a message published on replica A
won't reach a user connected to replica B. That's the seam left for **Redis Pub/Sub**:
add a Redis plugin, set `BROADCASTER=redis` and `REDIS_URL`, and back the broadcaster in
[`backend/app/realtime.py`](backend/app/realtime.py) with Redis. For a single instance
(the default), you don't need it.

---

## Alternative pairing: Vercel + Render + Neon

Same shape, different vendors:
- **Neon** → managed Postgres; copy its connection string into `DATABASE_URL` (Neon emits
  `postgresql://…`, works directly).
- **Render** → **New → Web Service** from the repo, Root Directory `backend`, runtime
  **Docker**; Render injects `PORT` the same way. Add the same backend variables.
- **Vercel** → identical to Part 3.

The env-var tables above are unchanged; only the hosting UI differs.
