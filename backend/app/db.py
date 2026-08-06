"""SQLite connection handling, schema, and first-run seeding.

Access is through Python's stdlib `sqlite3` — no ORM. Every statement in this
package is parameterised with `?` placeholders; there is no string-formatted SQL
anywhere, and column names that vary at runtime (see `repository.update_lead`)
come from a whitelist rather than the request body.
"""

import sqlite3
from collections.abc import Iterator
from pathlib import Path

from .config import DB_PATH

# Mirrors LEAD_STATUSES in src/context/LeadsContext.tsx. Kept as a plain tuple so
# it can be interpolated into the CHECK constraint below at import time.
LEAD_STATUSES = ("New", "Contacted", "Replied", "Closed")

_STATUS_LIST = ", ".join(f"'{status}'" for status in LEAD_STATUSES)

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS leads (
  id         TEXT PRIMARY KEY,
  company    TEXT NOT NULL,
  contact    TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  research   TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL CHECK (status IN ({_STATUS_LIST})),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status     ON leads(status);
"""

# The same three examples the frontend used to seed into localStorage, so a fresh
# clone still opens onto a populated pipeline. `created_at` is a full timestamp —
# see the note in `row_to_dict`'s caller about why the date alone is not enough.
SEED_LEADS = [
    {
        "id": "seed-acme",
        "company": "Acme Corp",
        "contact": "Jane Rivera",
        "title": "VP of Sales",
        "notes": "Met at SaaStr, interested in Q3 rollout",
        "research": "Series B, ~120 employees, uses HubSpot today",
        "status": "Contacted",
        "created_at": "2026-07-20T00:00:00Z",
        "updated_at": "2026-07-20T00:00:00Z",
    },
    {
        "id": "seed-northwind",
        "company": "Northwind Traders",
        "contact": "Sam Okafor",
        "title": "Head of Ops",
        "notes": "Cold outreach via LinkedIn",
        "research": "",
        "status": "New",
        "created_at": "2026-07-24T00:00:00Z",
        "updated_at": "2026-07-24T00:00:00Z",
    },
    {
        "id": "seed-globex",
        "company": "Globex",
        "contact": "Priya Nair",
        "title": "Director of Growth",
        "notes": "Replied asking for pricing",
        "research": "Recently raised Series A, hiring 3 SDRs",
        "status": "Replied",
        "created_at": "2026-07-15T00:00:00Z",
        "updated_at": "2026-07-15T00:00:00Z",
    },
]


def connect(db_path: Path | str = DB_PATH) -> sqlite3.Connection:
    """Opens a connection with the settings every caller in this app expects.

    `check_same_thread=False` is required, not a shortcut. FastAPI runs a sync
    generator dependency and the endpoint that depends on it in *different*
    threadpool threads, so the connection `get_conn` opens is always used from a
    thread other than the one that created it — sqlite3's default check rejects
    that outright. (Sequentially it can appear to work, because anyio hands out
    the same idle worker twice; it fails the moment two requests overlap.)

    What the flag gives up is sqlite3's guard against *sharing* one connection
    between threads. That guard is not what keeps this app safe — opening a
    connection per request is. Never hoist this to a module-level singleton.
    """
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (name,),
    ).fetchone()
    return row is not None


def init_db(db_path: Path | str = DB_PATH) -> None:
    """Creates the schema, and seeds examples **only on the very first run**.

    The seed condition is "the table did not exist", not "the table is empty",
    and the difference matters: seeding an empty table would resurrect the three
    examples every time someone deleted their last lead and restarted the server.
    That is the same trap the frontend's `readStoredLeads` avoids by
    distinguishing "nothing saved yet" from "saved, and legitimately empty".
    """
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    conn = connect(db_path)
    try:
        # WAL lets a reader and a writer coexist, which a dev server with a live
        # reloader will do. Set once, then persisted in the database file itself.
        conn.execute("PRAGMA journal_mode = WAL")

        is_first_run = not _table_exists(conn, "leads")
        conn.executescript(SCHEMA)

        if is_first_run:
            with conn:
                conn.executemany(
                    """
                    INSERT INTO leads
                      (id, company, contact, title, notes, research,
                       status, created_at, updated_at)
                    VALUES
                      (:id, :company, :contact, :title, :notes, :research,
                       :status, :created_at, :updated_at)
                    """,
                    SEED_LEADS,
                )
    finally:
        conn.close()


def get_conn() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: one connection per request, closed on the way out.

    A single module-level connection would be simpler to write and wrong to run —
    the endpoints are sync `def`, so FastAPI executes them in a threadpool and
    several requests would be inside the one connection at once. Opening a SQLite
    file is cheap; sharing it is not. See `connect` for why the same-thread check
    has to be off even though each connection serves exactly one request.
    """
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
