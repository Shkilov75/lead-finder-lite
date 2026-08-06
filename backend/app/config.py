"""Runtime configuration, read from the environment with workshop-friendly defaults.

Nothing here is required to run the app — `uvicorn app.main:app` works out of the
box. The environment variables exist so the database can be pointed at a scratch
file, and so the allowed origins can change without editing code.

`LEAD_FINDER_DB` must name a file. `:memory:` is not an option: connections are
opened per request (see `db.get_conn`), and an in-memory database belongs to the
one connection that created it, so every request would get an empty one.
"""

import os
from pathlib import Path

# backend/app/config.py -> backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent

DEFAULT_DB_PATH = BACKEND_DIR / "data" / "leads.db"

# Absolute, so the server finds the same file regardless of the working directory
# uvicorn was launched from.
DB_PATH = Path(os.environ.get("LEAD_FINDER_DB", DEFAULT_DB_PATH)).resolve()

# The Next.js dev server. Comma-separated to allow more than one.
DEFAULT_CORS_ORIGINS = "http://localhost:3000"

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]
