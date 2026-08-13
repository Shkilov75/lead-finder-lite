"""Runtime configuration, read from the environment.

Unlike the SQLite version this replaced, `DATABASE_URL` is **required** — there is
no local file to fall back to, so a missing URL is a configuration error and is
reported as one at import time rather than as a connection failure on the first
request.

Point it at Supabase's **transaction pooler** (Supavisor, port 6543), not at the
database host directly. Two reasons, both of which bite only in production:

* Direct connections (`db.<ref>.supabase.co:5432`) resolve to IPv6 only. Vercel's
  Python functions cannot be relied on to have IPv6 egress, so the direct host is
  simply unreachable from the deployed app.
* Every serverless invocation opens its own connection. Postgres caps those in
  the low hundreds; the pooler multiplexes them so a traffic spike degrades
  instead of exhausting `max_connections`.
"""

import os

# postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Copy .env.example to .env.local and paste the "
        "Supabase connection string (Project Settings -> Database -> Connection "
        "string -> Transaction pooler)."
    )

# The Next.js dev server. Comma-separated to allow more than one.
DEFAULT_CORS_ORIGINS = "http://localhost:3000"

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]
