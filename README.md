# Lead Finder Lite

A minimal CRM-style tool built during the vibe-to-live workshop, on top of the
[TailAdmin free Next.js template](https://github.com/TailAdmin/free-nextjs-admin-dashboard),
with a FastAPI + SQLite backend.

## What it does

- **Add a lead** — company name, contact name, title, one-line notes
- **View leads** — a table showing the pipeline status of each lead
- **Edit a lead** — the pencil button on a CRM row reopens the form
- **Update status** — click a status badge to move the lead along
  `New → Contacted → Replied → Closed` (it wraps back to `New`, so a mis-click
  is easy to undo)
- **Research notes** — paste in whatever you found

Research notes are **filled in by hand**. There is no scraping and no
enrichment API, which keeps the workshop demo free to run and safe to demo
live.

Leads live in a SQLite file at `backend/data/leads.db`, served by the FastAPI
app in [`backend/`](backend/). The database is created and seeded with three
example leads the first time the API starts; delete the file to start over.

## Getting started

Two processes: the Next.js app and the API. Run them in separate terminals.

```bash
# terminal 1 — API
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000

# terminal 2 — web app
npm install
npm run dev      # http://localhost:3000
```

The browser only ever talks to `localhost:3000`: `next.config.ts` rewrites
`/api/*` through to the API, so nothing is cross-origin and no API URL ends up
in the client bundle.

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server with hot reload |
| `npm run dev:api` | The API, via the venv in `backend/` |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

API reference and layout notes: [`backend/README.md`](backend/README.md).
Interactive docs at <http://localhost:8000/docs> while the API is running.

## Pages

| Route | Contents |
| --- | --- |
| `/` | Dashboard — lead totals per pipeline stage, plus the 5 most recent leads |
| `/crm` | CRM — the full lead table, the **Add lead** form, and per-row editing |

## Where to go next

This is intentionally simpler than the original guide's five-skill chain. Those
are the stretch goals once you're comfortable in the codebase:

1. **ICP Builder** — describe your ideal customer profile and score leads against it
2. **Prospect Finder** — go from an ICP to a list of candidate companies
3. **Company Spy** — replace the manual research notes field with real lookups
4. **Message Crafter** — draft outreach from the lead's notes and research
5. **Follow-Up Sequencer** — schedule and track follow-ups per pipeline stage

Some starting points in the code:

- Lead shape and pipeline statuses live in
  [`src/context/LeadsContext.tsx`](src/context/LeadsContext.tsx), which also
  holds every mutation. Adding a field means four places: the `Lead` type there,
  the Pydantic models in [`backend/app/schemas.py`](backend/app/schemas.py), the
  table in [`backend/app/db.py`](backend/app/db.py), and the form in
  [`src/components/leads/`](src/components/leads/).
- The only code that talks to the API is [`src/lib/api.ts`](src/lib/api.ts).
  Mutations are optimistic — the table updates on click and the request follows,
  rolling back with a banner if it fails.
- New pages added under `src/app/(admin)/` pick up the sidebar and header
  automatically. Add them to `navItems` in
  [`src/layout/AppSidebar.tsx`](src/layout/AppSidebar.tsx) to get a menu entry.
