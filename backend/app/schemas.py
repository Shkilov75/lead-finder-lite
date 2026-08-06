"""Request and response models.

These mirror the TypeScript types in `src/context/LeadsContext.tsx`:

    LeadCreate  <->  LeadDraft
    LeadOut     <->  Lead

`LeadOut` serialises with camelCase aliases, so the JSON the frontend receives
already matches the `Lead` type field for field. That is deliberate — it means
`src/lib/api.ts` is a fetch wrapper and nothing more, with no renaming layer to
keep in sync.
"""

from enum import Enum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

from .db import LEAD_STATUSES


class LeadStatus(str, Enum):
    NEW = "New"
    CONTACTED = "Contacted"
    REPLIED = "Replied"
    CLOSED = "Closed"


# The pipeline is spelled out in three places — this enum, the CHECK constraint
# in `db.SCHEMA`, and `LEAD_STATUSES` in the frontend. Two of them are in Python,
# so hold them together here rather than hoping.
assert tuple(status.value for status in LeadStatus) == LEAD_STATUSES

# Whitespace is stripped before validation, so a field of nothing but spaces
# fails `min_length` instead of being stored as "   ".
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
RequiredText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
NoteText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
ResearchText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class LeadCreate(CamelModel):
    """A new lead. Status and dates are the server's to decide, so they are absent."""

    company: RequiredText
    contact: RequiredText
    title: ShortText = ""
    notes: NoteText = ""
    research: ResearchText = ""


class LeadUpdate(CamelModel):
    """A partial edit. Every field is optional; only what is sent gets written."""

    company: RequiredText | None = None
    contact: RequiredText | None = None
    title: ShortText | None = None
    notes: NoteText | None = None
    research: ResearchText | None = None
    status: LeadStatus | None = None

    @model_validator(mode="after")
    def reject_empty_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        return self


class LeadOut(CamelModel):
    id: str
    company: str
    contact: str
    title: str
    notes: str
    research: str
    status: LeadStatus
    # Date only (yyyy-mm-dd), which is what `formatLeadDate` in src/lib/format.ts
    # parses. The database stores a full timestamp; see `repository.row_to_lead`.
    created_at: str
