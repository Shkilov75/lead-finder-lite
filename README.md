# Lead Finder Lite

A minimal CRM-style tool built during the vibe-to-live workshop, on top of the
[TailAdmin free Next.js template](https://github.com/TailAdmin/free-nextjs-admin-dashboard).

## What it does

- **Add a lead** — company name, contact name, title, one-line notes
- **View leads** — a table showing the pipeline status of each lead
- **Update status** — click a status badge to move the lead along
  `New → Contacted → Replied → Closed` (it wraps back to `New`, so a mis-click
  is easy to undo)
- **Research notes** — paste in whatever you found

Research notes are **filled in by hand**. There is no scraping and no
enrichment API, which keeps the workshop demo free to run and safe to demo
live.

Leads are stored in your browser's `localStorage`, so they survive a reload but
stay on your machine. Clearing site data resets to the three example leads.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

## Pages

| Route | Contents |
| --- | --- |
| `/` | Dashboard — lead totals per pipeline stage, plus the 5 most recent leads |
| `/crm` | CRM — the full lead table and the **Add lead** form |

## Where to go next

This is intentionally simpler than the original guide's five-skill chain. Those
are the stretch goals once you're comfortable in the codebase:

1. **ICP Builder** — describe your ideal customer profile and score leads against it
2. **Prospect Finder** — go from an ICP to a list of candidate companies
3. **Company Spy** — replace the manual research notes field with real lookups
4. **Message Crafter** — draft outreach from the lead's notes and research
5. **Follow-Up Sequencer** — schedule and track follow-ups per pipeline stage

Some starting points in the code:

- Lead shape, pipeline statuses, and all mutations live in
  [`src/context/LeadsContext.tsx`](src/context/LeadsContext.tsx) — add a field
  there first, then surface it in
  [`src/components/leads/`](src/components/leads/).
- Swapping `localStorage` for a real backend means replacing the two effects in
  `LeadsContext`; nothing else touches storage.
- New pages added under `src/app/(admin)/` pick up the sidebar and header
  automatically. Add them to `navItems` in
  [`src/layout/AppSidebar.tsx`](src/layout/AppSidebar.tsx) to get a menu entry.
