"""HTTP surface for leads.

Endpoints are sync `def`, not `async def`, on purpose: `psycopg`'s sync driver
blocks, and FastAPI runs sync handlers in a threadpool where blocking is
harmless. Declaring them `async` would block the event loop instead — and over a
network connection to the pooler the blocking window is far longer than it was
against a local SQLite file.
"""

import psycopg

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from .. import repository
from ..db import get_conn
from ..schemas import LeadCreate, LeadOut, LeadStatus, LeadUpdate

router = APIRouter(prefix="/api", tags=["leads"])

NOT_FOUND = "Lead not found."


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/leads", response_model=list[LeadOut])
def list_leads(
    conn: psycopg.Connection = Depends(get_conn),
    # Named `lead_status` locally so it does not shadow fastapi's `status` module,
    # which the decorators above use for the response codes.
    lead_status: LeadStatus | None = Query(
        default=None, alias="status", description="Filter by status"
    ),
    q: str | None = Query(default=None, description="Match company or contact"),
) -> list[LeadOut]:
    return repository.list_leads(
        conn, status=lead_status.value if lead_status else None, q=q
    )


@router.post("/leads", response_model=LeadOut, status_code=status.HTTP_201_CREATED)
def create_lead(
    payload: LeadCreate,
    conn: psycopg.Connection = Depends(get_conn),
) -> LeadOut:
    return repository.create_lead(conn, payload)


@router.get("/leads/{lead_id}", response_model=LeadOut)
def get_lead(
    lead_id: str,
    conn: psycopg.Connection = Depends(get_conn),
) -> LeadOut:
    lead = repository.get_lead(conn, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return lead


@router.patch("/leads/{lead_id}", response_model=LeadOut)
def update_lead(
    lead_id: str,
    payload: LeadUpdate,
    conn: psycopg.Connection = Depends(get_conn),
) -> LeadOut:
    """PATCH rather than PUT — the body is a partial edit, not a replacement."""
    lead = repository.update_lead(conn, lead_id, payload)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return lead


@router.post("/leads/{lead_id}/advance", response_model=LeadOut)
def advance_status(
    lead_id: str,
    conn: psycopg.Connection = Depends(get_conn),
) -> LeadOut:
    """POST, not PATCH: calling it twice moves the lead two steps, so it is not
    idempotent. The next status is computed here so the pipeline order has one
    authoritative home."""
    lead = repository.advance_status(conn, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return lead


@router.delete("/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(
    lead_id: str,
    conn: psycopg.Connection = Depends(get_conn),
) -> Response:
    if not repository.delete_lead(conn, lead_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
