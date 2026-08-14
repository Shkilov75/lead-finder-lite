# Lead Finder Lite API

FastAPI over Supabase Postgres. It stores leads and nothing else — no scraping,
no enrichment, no third-party data provider. Research notes are typed in by hand,
on purpose. (Supabase is this app's *own* database, which is what the
no-data-provider rule has always allowed.)

## Setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Then create the table. Open the Supabase dashboard → **SQL Editor** → New query,
paste [`supabase/migrations/0001_create_leads.sql`](../supabase/migrations/0001_create_leads.sql),
and run it once. The application never issues DDL — see *Schema* below.

Finally, copy `.env.example` to `.env.local` in the repository root and fill in
`DATABASE_URL`.

## Run

```bash
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Or from the repository root: `npm run dev:api`, which loads `.env.local` first.

Interactive docs: <http://localhost:8000/docs>.

The Next.js dev server proxies `/api/*` here (see `next.config.ts`), so with both
processes running the browser only ever talks to `localhost:3000`.

There is no offline mode. `DATABASE_URL` is required and the app refuses to
import without it — the old local SQLite file is gone, so a missing URL is a
configuration error rather than a silent fallback to a different database.

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
| `app/config.py` | `DATABASE_URL` and CORS origins, from the environment |
| `app/db.py` | Connection helper and the FastAPI dependency |
| `app/schemas.py` | Pydantic request/response models |
| `app/repository.py` | Every SQL statement in the app |
| `app/routers/leads.py` | HTTP endpoints |
| `app/main.py` | App wiring: CORS, router |
| `../api/index.py` | Vercel entry point — imports this same `app` |

Data access is `psycopg` (v3) using plain SQL — still no ORM. Five things to
preserve when editing it:

- **One connection per request** (`db.get_conn`, a FastAPI dependency). The
  endpoints are sync `def`, so FastAPI runs them in a threadpool; psycopg
  connections are not safe to share across threads, and a module-level one would
  be several requests deep at once.
- **`prepare_threshold=None`.** Supavisor's transaction mode gives each
  transaction whatever backend is free, so a server-side prepared statement
  routinely gets `PREPARE`d on one backend and `EXECUTE`d on another. Removing
  this flag makes the app fail only under concurrency, which is the worst way to
  find out.
- **Writes use `RETURNING`.** One round trip per mutation instead of a write
  followed by a `SELECT`. Over a network connection the second query is not free.
- **`ILIKE`, not `LIKE`.** SQLite's `LIKE` was case-insensitive for ASCII;
  Postgres' is not. Reverting this would quietly make the search box
  case-sensitive.
- **`with conn.transaction():` around writes, never `with conn:`.** In psycopg 3
  a connection used as a context manager commits *and closes* on exit — unlike
  psycopg2, where `with conn` was only a transaction block. `with conn:` leaves
  the rest of the request holding a closed connection, which stays invisible
  exactly until some handler runs a second statement.

## Schema

The table is defined in `supabase/migrations/0001_create_leads.sql` and applied
by hand, once. Nothing in the application creates or alters it.

That is a change from the SQLite version, which created its table on startup.
On a serverless platform a startup hook runs on *every cold start*, so it would
mean many instances racing to issue the same DDL against a shared database. It
also relocates the "seed only on the first run, never merely when the table is
empty" rule, which now lives in the seed insert's
`where not exists (select 1 from public.leads)`.

The trailing `on conflict do nothing` is **not** what enforces that rule, and
reading it as if it did is the trap: it only suppresses duplicate-key errors, so
on its own it would happily resurrect a seed you had deleted the moment anyone
pasted the file a second time. The `where not exists` is the guard; the
`on conflict` clause is only there for two people running the migration at once.

The migration also enables Row Level Security with **no policies**, which is
what keeps the table off Supabase's public PostgREST API. The backend is
unaffected — it connects as the table's owner, which bypasses RLS. See the
comment in the migration for the full reasoning.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | Supabase connection string. Use the **transaction pooler** (port `6543`), not the direct connection — the direct host is IPv6-only and Vercel's Python functions cannot be relied on to reach it, and the pooler is what keeps per-invocation connections from exhausting Postgres' limit |
| `CORS_ORIGINS` | no | Comma-separated allowed origins. Default `http://localhost:3000` |

`DATABASE_URL` contains the database password. It belongs in `.env.local`
(gitignored) locally and in Vercel's Environment Variables in production — never
in a committed file.
