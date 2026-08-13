"""Postgres connection handling for the Supabase-backed lead pipeline.

Access is through `psycopg` (v3) — no ORM. Every statement in this package is
parameterised with `%s` placeholders; there is no string-formatted SQL anywhere,
and column names that vary at runtime (see `repository.update_lead`) come from a
whitelist rather than the request body.

**The app never runs DDL.** The schema lives in `supabase/migrations/` and is
applied once, by hand, in the Supabase SQL editor. The SQLite version created its
table on startup, which made sense for a file that ships empty; against a shared
Postgres it would mean every cold start of every serverless instance racing to
run `CREATE TABLE`. Seeding moved into that same migration, so the "seed only on
first run" rule is now enforced by the migration running exactly once.
"""

from collections.abc import Iterator

import psycopg
from psycopg.rows import dict_row

from .config import DATABASE_URL

# Mirrors LEAD_STATUSES in src/context/LeadsContext.tsx, and the CHECK constraint
# in the migration. `schemas.py` asserts this against its own enum at import time.
LEAD_STATUSES = ("New", "Contacted", "Replied", "Closed")


def connect() -> psycopg.Connection:
    """Opens a connection with the settings every caller in this app expects.

    `prepare_threshold=None` is required, not a tuning knob. psycopg promotes a
    statement to a server-side prepared statement once it has been seen a few
    times, but Supavisor in **transaction mode** hands each transaction whatever
    backend is free — so the `PREPARE` and the `EXECUTE` routinely land on
    different backends and the execute fails with "prepared statement does not
    exist". Setting it to None keeps every statement a plain parameterised
    query, which is what the pooler can actually route.

    `dict_row` keeps `row["company"]` working, so `repository.row_to_lead` reads
    the same as it did against `sqlite3.Row`.
    """
    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
        prepare_threshold=None,
        # A serverless invocation that cannot reach the database should fail
        # fast and return a 500, not hold the request open until the platform
        # kills it.
        connect_timeout=10,
    )


def get_conn() -> Iterator[psycopg.Connection]:
    """FastAPI dependency: one connection per request, closed on the way out.

    A module-level connection would be simpler to write and wrong to run — the
    endpoints are sync `def`, so FastAPI executes them in a threadpool and
    several requests would be inside the one connection at once. psycopg
    connections are not safe to use concurrently from multiple threads.

    Closing matters more here than it did with SQLite: the pooler counts open
    client connections, and a leaked one stays counted until it times out.
    """
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
