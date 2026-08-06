"""Every SQL statement in the app lives here.

The functions take a `sqlite3.Connection` and know nothing about HTTP — the
router turns their return values into responses and status codes.
"""

import sqlite3
from datetime import datetime, timezone
from uuid import uuid4

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


def now_iso() -> str:
    """UTC, second precision, e.g. `2026-08-06T14:23:11Z`."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def row_to_lead(row: sqlite3.Row) -> LeadOut:
    """Turns a database row into the response model.

    `created_at` is stored as a full timestamp but exposed as the date alone.
    The timestamp exists so `ORDER BY created_at DESC` is stable — with the date
    alone, three leads added on the same day would come back in arbitrary order.
    The date alone is what the UI shows, and what `formatLeadDate` parses.
    """
    return LeadOut(
        id=row["id"],
        company=row["company"],
        contact=row["contact"],
        title=row["title"],
        notes=row["notes"],
        research=row["research"],
        status=row["status"],
        created_at=row["created_at"][:10],
    )


def _like_pattern(term: str) -> str:
    """Escapes the wildcards SQLite's LIKE would otherwise honour in user input."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def list_leads(
    conn: sqlite3.Connection,
    status: str | None = None,
    q: str | None = None,
) -> list[LeadOut]:
    """Newest first — the order the table renders in."""
    sql = f"SELECT {COLUMNS} FROM leads"
    clauses: list[str] = []
    params: list[str] = []

    if status:
        clauses.append("status = ?")
        params.append(status)

    if q and q.strip():
        clauses.append(
            "(company LIKE ? ESCAPE '\\' OR contact LIKE ? ESCAPE '\\')"
        )
        pattern = _like_pattern(q.strip())
        params.extend([pattern, pattern])

    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY created_at DESC, id DESC"

    rows = conn.execute(sql, params).fetchall()
    return [row_to_lead(row) for row in rows]


def get_lead(conn: sqlite3.Connection, lead_id: str) -> LeadOut | None:
    row = conn.execute(
        f"SELECT {COLUMNS} FROM leads WHERE id = ?", (lead_id,)
    ).fetchone()
    return row_to_lead(row) if row else None


def create_lead(conn: sqlite3.Connection, data: LeadCreate) -> LeadOut:
    """Server owns the id, the starting status, and the timestamps."""
    lead_id = str(uuid4())
    timestamp = now_iso()

    with conn:
        conn.execute(
            """
            INSERT INTO leads
              (id, company, contact, title, notes, research,
               status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'New', ?, ?)
            """,
            (
                lead_id,
                data.company,
                data.contact,
                data.title,
                data.notes,
                data.research,
                timestamp,
                timestamp,
            ),
        )

    lead = get_lead(conn, lead_id)
    assert lead is not None  # just inserted in a committed transaction
    return lead


def update_lead(
    conn: sqlite3.Connection, lead_id: str, patch: LeadUpdate
) -> LeadOut | None:
    """Applies a partial edit. Returns None when the lead does not exist.

    `mode="json"` so a `LeadStatus` member arrives as the plain string SQLite can
    store; `exclude_unset` so "field omitted" and "field set to its default" stay
    distinguishable — omitting `notes` must not blank it out.
    """
    changes = patch.model_dump(mode="json", exclude_unset=True, exclude_none=True)
    fields = [name for name in changes if name in UPDATABLE_COLUMNS]

    if not fields:
        return get_lead(conn, lead_id)

    assignments = ", ".join(f"{name} = ?" for name in fields)
    params = [changes[name] for name in fields]
    params.append(now_iso())
    params.append(lead_id)

    with conn:
        cursor = conn.execute(
            f"UPDATE leads SET {assignments}, updated_at = ? WHERE id = ?",
            params,
        )

    if cursor.rowcount == 0:
        return None
    return get_lead(conn, lead_id)


# `CASE status WHEN ? THEN ? ... END`, one pair per status. Built once, and still
# fully parameterised — the placeholders are filled from NEXT_STATUS below.
_ADVANCE_CASE = "CASE status " + "WHEN ? THEN ? " * len(NEXT_STATUS) + "END"
_ADVANCE_PARAMS = [value for pair in NEXT_STATUS.items() for value in pair]


def advance_status(conn: sqlite3.Connection, lead_id: str) -> LeadOut | None:
    """Moves the lead one step along the pipeline, wrapping Closed back to New.

    The next status is chosen by the UPDATE itself rather than by reading the row
    first and writing the successor back. A read-then-write would need an
    explicit `BEGIN IMMEDIATE` to be safe — a bare SELECT starts no transaction,
    so two clicks arriving together could both read the same status and one of
    them would be lost. One statement has no such window.
    """
    with conn:
        cursor = conn.execute(
            f"UPDATE leads SET status = {_ADVANCE_CASE}, updated_at = ? "
            "WHERE id = ?",
            [*_ADVANCE_PARAMS, now_iso(), lead_id],
        )

    if cursor.rowcount == 0:
        return None
    return get_lead(conn, lead_id)


def delete_lead(conn: sqlite3.Connection, lead_id: str) -> bool:
    """True when a row was removed, False when the id was already gone."""
    with conn:
        cursor = conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    return cursor.rowcount > 0
