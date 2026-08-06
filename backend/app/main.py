"""FastAPI application entry point.

Run it with:

    uvicorn app.main:app --reload --port 8000

Interactive docs are then at http://localhost:8000/docs.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, DB_PATH
from .db import init_db
from .routers import leads


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Creates the schema if it is missing, and seeds the example leads only when
    # the database file had no `leads` table at all — never merely because the
    # table is empty. See the note in `db.init_db`.
    init_db()
    print(f"[lead-finder-lite] SQLite database: {DB_PATH}")
    yield


app = FastAPI(
    title="Lead Finder Lite API",
    description=(
        "CRUD over a SQLite-backed lead pipeline. There is no scraping, "
        "enrichment, or third-party data provider anywhere in this service — "
        "research notes are typed in by hand, on purpose."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# The Next.js dev server proxies /api/* to this app (see next.config.ts), so the
# browser sees a same-origin request and CORS never comes up there. This is here
# for the direct calls: curl, the Swagger UI, and anything hitting :8000 itself.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(leads.router)
