"""FastAPI application entry point.

Run it locally with:

    uvicorn app.main:app --reload --port 8000

Interactive docs are then at http://localhost:8000/docs.

In production the same `app` object is imported by `api/index.py` and served as a
Vercel Python function — there is no uvicorn there, the platform speaks ASGI to
this object directly. Keep module import side effects cheap: everything at import
time runs again on every cold start.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .routers import leads

app = FastAPI(
    title="Lead Finder Lite API",
    description=(
        "CRUD over a Supabase Postgres lead pipeline. There is no scraping, "
        "enrichment, or third-party data provider anywhere in this service — "
        "research notes are typed in by hand, on purpose."
    ),
    version="2.0.0",
)

# There is deliberately no startup hook creating the schema. The table is created
# once by supabase/migrations/0001_create_leads.sql, run by hand in the Supabase
# SQL editor. On a serverless platform a startup hook runs on every cold start,
# so it would mean many instances racing to issue the same DDL against a shared
# database — and it would defeat the "seed only on first run" rule, which is now
# a property of the migration being applied exactly once.

# The Next.js dev server proxies /api/* to this app (see next.config.ts), and in
# production Vercel routes /api/* to this same function on the same origin — so
# the browser never makes a cross-origin request either way. This is here for the
# direct calls: curl, the Swagger UI, and anything hitting the port itself.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(leads.router)
