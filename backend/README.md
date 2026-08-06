# Lead Finder Lite API

FastAPI over a SQLite file. It stores leads and nothing else — no scraping, no
enrichment, no third-party data provider. Research notes are typed in by hand,
on purpose.

## Setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run

```bash
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Or from the repository root: `npm run dev:api`.

Interactive docs: <http://localhost:8000/docs>.

The Next.js dev server proxies `/api/*` here (see `next.config.ts`), so with both
processes running the browser only ever talks to `localhost:3000`.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check |
| `GET` | `/api/leads` | Newest first. Optional `?status=` and `?q=` (company or contact) |
| `POST` | `/api/leads` | `201`. Server assigns the id, `status: "New"`, and the date |
| `GET` | `/api/leads/{id}` | |
| `PATCH` | `/api/leads/{id}` | Partial edit — send only the fields that changed |
| `POST` | `/api/leads/{id}/advance` | One step along the pipeline, wrapping `Closed → New` |
| `DELETE` | `/api/leads/{id}` | `204`, or `404` if it was already gone |

`PATCH` rather than `PUT` because the body is a partial edit; `POST` for
`advance` because calling it twice moves the lead two steps, so it is not
idempotent.

Responses use camelCase (`createdAt`), matching the frontend's `Lead` type field
for field — which is why `src/lib/api.ts` needs no renaming layer.

## Layout

| File | Contents |
| --- | --- |
| `app/config.py` | Database path and CORS origins, from the environment |
| `app/db.py` | Connection helper, schema, first-run seeding |
| `app/schemas.py` | Pydantic request/response models |
| `app/repository.py` | Every SQL statement in the app |
| `app/routers/leads.py` | HTTP endpoints |
| `app/main.py` | App wiring: lifespan, CORS, router |

Data access is the standard library's `sqlite3` — no ORM, no database driver to
install. Two things to preserve when editing it:

- **One connection per request** (`db.get_conn`, a FastAPI dependency). The
  endpoints are sync `def`, so FastAPI runs them in a threadpool; a shared
  connection with `check_same_thread=False` would be several requests deep at
  once.
- **Seed only when the table did not exist**, never merely when it is empty.
  Seeding an empty table would resurrect the three examples every time someone
  deleted their last lead and restarted the server.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `LEAD_FINDER_DB` | `backend/data/leads.db` | Database file. Point it at a scratch path to experiment without touching real data. Must be a file — `:memory:` cannot work, because connections are per-request and an in-memory database dies with the connection that made it |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |

The database file is created on first start, seeded with the same three example
leads the UI used to ship with. It is gitignored — delete it to start over.
