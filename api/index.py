"""Vercel entry point for the FastAPI backend.

Vercel's Python runtime treats every file under `api/` as a serverless function
and, when the module exposes a variable named `app` that speaks ASGI, serves it
directly — no uvicorn process, no port. `vercel.json` rewrites every `/api/*`
request onto this one function, so FastAPI keeps doing its own routing and the
endpoint list stays in `backend/app/routers/leads.py`.

The `sys.path` line puts `backend/` on the import path so `app.main` resolves the
same way it does locally, where `npm run dev:api` runs uvicorn from inside that
directory. Importing it as `backend.app.main` instead would have been a second,
subtly different import root — and the one that only exists in production is
exactly the one that breaks without warning.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402  (must follow the sys.path line above)

__all__ = ["app"]
