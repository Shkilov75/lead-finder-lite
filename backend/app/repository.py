"""Every SQL statement in the app lives here.

The functions take a `psycopg.Connection` and know nothing about HTTP — the
router turns their return values into responses and status codes.

Three things changed in the move from SQLite to Postgres, and each is load-bearing:

* Placeholders are `%s`, not `?`. They are still placeholders — no value is ever
  formatted into a statement.
* Writes use `RETURNING`, so an insert or update is **one** round trip instead of
  a write followed by a `SELECT`. Over a local file that second query was free;
  over the pooler it is another network hop on every mutation.
* `LIKE` became `ILIKE`. SQLite's `LIKE` is case-insensitive for ASCII by
  default, Postgres' is not — keeping `LIKE` would have quietly made the search
  box case-sensitive.

Writes are wrapped in `with conn.transaction():`, **not** `with conn:`. They look
interchangeable and are not: psycopg 3's `Connection.__exit__` commits and then
*closes* the connection, unlike psycopg2's, where `with conn` was a transaction
block and nothing more. Under `with conn:` every mutation would hand back a dead
connection halfway through the request — harmless only for as long as no endpoint
runs a second statement afterwards, and a confusing "the connection is closed" the
first time one does. Closing belongs to `db.get_conn`, which owns the connection.
"""

from datetime import timezone
from typing import Any

import psycopg

from .db import LEAD_STATUSES
from .schemas import LeadCreate, LeadOut, LeadUpdate

# Mirrors `nextStatus` in src/context/LeadsContext.tsx, wrap included. Closing the
# loop back to New is on purpose: clicking the badge is the only way to change a
# status, so wrapping is what makes a mis-click recoverable.
NEXT_STATUS = {
    status: LEAD_STATUSES[(index + 1) % len(LEAD_STATUSES)]
    for index, status in enumerate(LEAD_STATUSES)
}

COLUMNS = (
    "id, company, contact, title, notes, research, status, created_at, updated_at"
)

# Only these may appear on the left of a `SET`. The keys of an incoming patch are
# checked against this tuple, so no request body can ever name a column.
UPDATABLE_COLUMNS = ("company", "contact", "title", "notes", "research", "status")


def row_to_lead(row: dict[str, Any]) -> LeadOut:
    """Turns a database row into the response model.

    `created_at` is a `timestamptz` in the database but is exposed as the date
    alone. The time component exists so `ORDER BY created_at DESC` is stable —
    with the date alone, three leads added on the same day would come back in
    arbitrary order. The date alone is what the UI shows, and what
    `formatLeadDate` parses.

    The `astimezone(utc)` is not redundant. psycopg hands back a tz-aware
    datetime in the *session's* time zone, so `.date()` on it would answer "what
    day is it where the database thinks it lives". Supabase defaults that to UTC
    and everything lines up — until a role- or pooler-level `TimeZone` setting
    says otherwise, at which point every lead created late in the day silently
    reports the wrong date. Pinning to UTC keeps this the same answer the SQLite
    version gave by slicing an ISO string that always ended in `Z`.
    """
    return LeadOut(
        id=row["id"],
        company=row["company"],
        contact=row["contact"],
        title=row["title"],
        notes=row["notes"],
        research=row["research"],
        status=row["status"],
        created_at=row["created_at"].astimezone(timezone.utc).date().isoformat(),
    )


def _like_pattern(term: str) -> str:
    """Escapes the wildcards ILIKE would otherwise honour in user input."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def list_leads(
    conn: psycopg.Connection,
    status: str | None = None,
    q: str | None = None,
) -> list[LeadOut]:
    """Newest first — the order the table renders in."""
    sql = f"SELECT {COLUMNS} FROM leads"
    clauses: list[str] = []
    params: list[str] = []

    if status:
        clauses.append("status = %s")
        params.append(status)

    if q and q.strip():
        clauses.append(
            "(company ILIKE %s ESCAPE '\\' OR contact ILIKE %s ESCAPE '\\')"
        )
        pattern = _like_pattern(q.strip())
        params.extend([pattern, pattern])

    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY created_at DESC, id DESC"

    rows = conn.execute(sql, params).fetchall()
    return [row_to_lead(row) for row in rows]


def get_lead(conn: psycopg.Connection, lead_id: str) -> LeadOut | None:
    row = conn.execute(
        f"SELECT {COLUMNS} FROM leads WHERE id = %s", (lead_id,)
    ).fetchone()
    return row_to_lead(row) if row else None


def create_lead(conn: psycopg.Connection, data: LeadCreate) -> LeadOut:
    """Server owns the id, the starting status, and the timestamps.

    All three come from column defaults in the migration rather than from Python,
    so there is one authoritative answer to "what time is it" — the database's.
    """
    with conn.transaction():
        row = conn.execute(
            f"""
            INSERT INTO leads (company, contact, title, notes, research, status)
            VALUES (%s, %s, %s, %s, %s, 'New')
            RETURNING {COLUMNS}
            """,
            (data.company, data.contact, data.title, data.notes, data.research),
        ).fetchone()

    assert row is not None  # INSERT ... RETURNING always yields the inserted row
    return row_to_lead(row)


def update_lead(
    conn: psycopg.Connection, lead_id: str, patch: LeadUpdate
) -> LeadOut | None:
    """Applies a partial edit. Returns None when the lead does not exist.

    `mode="json"` so a `LeadStatus` member arrives as the plain string the column
    stores; `exclude_unset` so "field omitted" and "field set to its default"
    stay distinguishable — omitting `notes` must not blank it out.
    """
    changes = patch.model_dump(mode="json", exclude_unset=True, exclude_none=True)
    fields = [name for name in changes if name in UPDATABLE_COLUMNS]

    if not fields:
        return get_lead(conn, lead_id)

    assignments = ", ".join(f"{name} = %s" for name in fields)
    params = [changes[name] for name in fields]
    params.append(lead_id)

    with conn.transaction():
        row = conn.execute(
            f"UPDATE leads SET {assignments}, updated_at = now() "
            f"WHERE id = %s RETURNING {COLUMNS}",
            params,
        ).fetchone()

    # No row returned means no row matched — the id is gone.
    return row_to_lead(row) if row else None


# `CASE status WHEN %s THEN %s ... END`, one pair per status. Built once, and
# still fully parameterised — the placeholders are filled from NEXT_STATUS below.
_ADVANCE_CASE = "CASE status " + "WHEN %s THEN %s " * len(NEXT_STATUS) + "END"
_ADVANCE_PARAMS = [value for pair in NEXT_STATUS.items() for value in pair]


def advance_status(conn: psycopg.Connection, lead_id: str) -> LeadOut | None:
    """Moves the lead one step along the pipeline, wrapping Closed back to New.

    The next status is chosen by the UPDATE itself rather than by reading the row
    first and writing the successor back. A read-then-write would need an
    explicit `SELECT ... FOR UPDATE` to be safe — a bare SELECT takes no row
    lock, so two clicks arriving together could both read the same status and one
    of them would be lost. One statement has no such window.
    """
    with conn.transaction():
        row = conn.execute(
            f"UPDATE leads SET status = {_ADVANCE_CASE}, updated_at = now() "
            f"WHERE id = %s RETURNING {COLUMNS}",
            [*_ADVANCE_PARAMS, lead_id],
        ).fetchone()

    return row_to_lead(row) if row else None


def delete_lead(conn: psycopg.Connection, lead_id: str) -> bool:
    """True when a row was removed, False when the id was already gone."""
    with conn.transaction():
        cursor = conn.execute("DELETE FROM leads WHERE id = %s", (lead_id,))
    return cursor.rowcount > 0
