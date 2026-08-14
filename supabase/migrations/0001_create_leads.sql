-- Lead Finder Lite — the one and only table.
--
-- Run this once, by hand: Supabase dashboard -> SQL Editor -> New query -> Run.
-- The application never issues DDL; see the note in backend/app/main.py for why
-- a startup hook is the wrong place for it on a serverless platform.

create table if not exists public.leads (
  id         text        primary key default gen_random_uuid()::text,
  company    text        not null,
  contact    text        not null,
  title      text        not null default '',
  notes      text        not null default '',
  research   text        not null default '',
  -- Mirrors LEAD_STATUSES in backend/app/db.py and src/context/LeadsContext.tsx.
  status     text        not null default 'New'
               check (status in ('New', 'Contacted', 'Replied', 'Closed')),
  -- timestamptz, not date: the time component is what makes ORDER BY stable for
  -- leads added on the same day. The API serialises the date half only.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_created_at on public.leads (created_at desc);
create index if not exists idx_leads_status     on public.leads (status);

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled, with **no policies on purpose**.
--
-- This is not ceremony. Supabase exposes every table in `public` through its
-- auto-generated PostgREST API, reachable by anyone holding the project's anon
-- key — and the anon key is designed to ship in browser code, so treat it as
-- public. With RLS off, that API would let the whole internet read and rewrite
-- this table.
--
-- Enabling RLS without adding a policy denies PostgREST outright. It does not
-- affect this app: the FastAPI backend connects over Postgres as the `postgres`
-- role, which owns the table and bypasses RLS. So the backend keeps full access
-- while the public REST surface is closed.
--
-- If you later add a policy to open PostgREST up, do it deliberately — the
-- moment one policy exists, RLS starts allowing what that policy matches.
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;

-- The three examples the workshop opens onto.
--
-- The `where not exists` is the seeding rule the SQLite version enforced in
-- Python: seed on the *first* run only, never merely because the table happens
-- to be empty right now — except here "first run" has to be expressed as "the
-- table has no rows at all", checked in the same statement that inserts.
--
-- `on conflict do nothing` alone would NOT be enough, and reading it that way is
-- the trap: it only suppresses the duplicate-key error. Delete `seed-acme`,
-- paste this file again, and nothing conflicts — so the seed comes back. The
-- guard below is what actually makes a second run a no-op once anyone has
-- touched the pipeline. The `on conflict` clause stays as a belt-and-braces
-- against two people running the migration at the same moment.
insert into public.leads
  (id, company, contact, title, notes, research, status, created_at, updated_at)
select *
from (
  values
    ('seed-acme', 'Acme Corp', 'Jane Rivera', 'VP of Sales',
     'Met at SaaStr, interested in Q3 rollout',
     'Series B, ~120 employees, uses HubSpot today',
     'Contacted', '2026-07-20T00:00:00Z'::timestamptz,
     '2026-07-20T00:00:00Z'::timestamptz),
    ('seed-northwind', 'Northwind Traders', 'Sam Okafor', 'Head of Ops',
     'Cold outreach via LinkedIn', '',
     'New', '2026-07-24T00:00:00Z'::timestamptz,
     '2026-07-24T00:00:00Z'::timestamptz),
    ('seed-globex', 'Globex', 'Priya Nair', 'Director of Growth',
     'Replied asking for pricing',
     'Recently raised Series A, hiring 3 SDRs',
     'Replied', '2026-07-15T00:00:00Z'::timestamptz,
     '2026-07-15T00:00:00Z'::timestamptz)
) as seed (
  id, company, contact, title, notes, research, status, created_at, updated_at
)
where not exists (select 1 from public.leads)
on conflict (id) do nothing;
