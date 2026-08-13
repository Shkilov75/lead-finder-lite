# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Lead Finder Lite** — a deliberately minimal CRM built for a "vibe-to-live" workshop. Five capabilities, nothing more:

1. Add a lead (company, contact, title, one-line notes)
2. View leads in a table with a status pipeline
3. Edit a lead from its row in the CRM table
4. Advance status by clicking the badge: `New → Contacted → Replied → Closed`
5. A **research notes** field that students paste findings into **by hand**

There is **no scraping, enrichment, or third-party data provider anywhere**, and that is a deliberate product constraint, not an unfinished edge — it keeps the class demo free and safe to run. Do not add live lookup, enrichment, or a data-provider integration unless explicitly asked. (The app's *own* FastAPI backend and its *own* Supabase database are not exceptions to this — the rule is about pulling in outside data, not about where this app keeps its own.) The original guide's 5-skill chain (ICP Builder → Prospect Finder → Company Spy → Message Crafter → Follow-Up Sequencer) is a post-workshop stretch goal, not the current scope.

## Commands

Two processes. The web app is useless without the API — every lead read and write goes through it.

```bash
npm run dev      # Next.js dev server (Turbopack) on :3000
npm run dev:api  # FastAPI via backend/.venv on :8000
npm run build    # production build; also runs the TypeScript check
npm run start    # serve the production build
npm run lint     # eslint (eslint-config-next)
```

First-time backend setup, in order:

1. `cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
2. Run [supabase/migrations/0001_create_leads.sql](supabase/migrations/0001_create_leads.sql) once in the Supabase SQL editor — the app never issues DDL.
3. `cp .env.example .env.local` and fill in `DATABASE_URL`.

**There is no offline mode.** `DATABASE_URL` is required; `config.py` raises at import time when it is missing, rather than falling back to anything. Don't reintroduce a local SQLite path as a "convenient default" — two code paths means the one you don't run in production is the one that breaks there.

There is **no test runner installed** on either side — don't assume `npm test` or `pytest` exists. `npm run build` is the type-check gate for the frontend; for the backend, `curl` against a running `uvicorn` (or `/docs`) is the check.

## Architecture

Built on the **TailAdmin free Next.js template**, trimmed to just this app. Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4.

### Routing and layout

Two pages, both `'use client'` because they read lead state from context:

- `src/app/(admin)/page.tsx` — Dashboard: stat cards + 5 most recent leads
- `src/app/(admin)/crm/page.tsx` — CRM: full table + the add/edit modal

`/api/*` is **not** a Next.js route — there are no route handlers and no server actions. It reaches the FastAPI app by two different mechanisms depending on the environment, and both keep the browser making same-origin requests with no API URL in the client bundle:

- **Development:** [next.config.ts](next.config.ts) rewrites `/api/*` to `BACKEND_ORIGIN` (default `http://localhost:8000`), the uvicorn process from `npm run dev:api`.
- **Production:** that rewrite returns `[]` — see the `VERCEL` guard. [vercel.json](vercel.json) routes `/api/*` to the Python function in [api/index.py](api/index.py) instead. Leaving the dev rewrite active on Vercel would point the deployed site at `localhost:8000`, so the guard is load-bearing. It keys off `VERCEL` rather than `NODE_ENV` deliberately: `next build`/`next start` also run with `NODE_ENV=production`, and rewrites are frozen into `routes-manifest.json` at build time, so a `NODE_ENV` check would strip the rewrite from a *local* production build too and leave `npm run start` with no API at all.

The `(admin)` route group owns the chrome. [src/app/(admin)/layout.tsx](src/app/(admin)/layout.tsx) composes `AppSidebar` + `AppHeader` + `Backdrop` and computes the main content's left margin from sidebar state — so a new page dropped into `(admin)/` inherits the shell with no wiring. [src/app/layout.tsx](src/app/layout.tsx) holds the three providers: `ThemeProvider` → `SidebarProvider` → `LeadsProvider`.

### Backend

[backend/](backend/) — FastAPI over **Supabase Postgres**, mounted at `/api`. `psycopg` v3 with hand-written SQL, **no ORM**; `backend/README.md` has the endpoint table. Layers: `config` → `db` → `schemas` → `repository` → `routers/leads` → `main`.

- **All SQL lives in `repository.py`.** Everything is parameterised with `%s`; the one place a column name varies at runtime (`update_lead`) picks it from the `UPDATABLE_COLUMNS` whitelist, never from the request body.
- **One connection per request**, via the `get_conn` dependency. Endpoints are sync `def` on purpose — FastAPI runs those in a threadpool, where blocking psycopg calls are harmless; `async def` would block the event loop. psycopg connections are not safe to share across threads, so don't hoist one to module level.
- **Always connect through the transaction pooler** (Supavisor, port `6543`), never the direct host. The direct host resolves to IPv6 only, which Vercel's Python functions cannot be relied on to reach, and per-invocation connections would otherwise exhaust Postgres' connection limit.
- **`prepare_threshold=None` is load-bearing, not a tuning knob.** psycopg promotes a repeated statement to a server-side prepared statement, but the pooler's transaction mode hands each transaction whatever backend is free — so the `PREPARE` and the `EXECUTE` land on different backends and the execute fails. Like the old `check_same_thread` trap, sequential testing won't reveal it; it surfaces under concurrency.
- **Writes use `RETURNING`.** An insert or update is one round trip, not a write followed by a `SELECT`. Against a local file that second query was free; over the pooler it is another network hop on every mutation.
- **`ILIKE`, not `LIKE`.** SQLite's `LIKE` was case-insensitive for ASCII, Postgres' is not — reverting this quietly makes the search box case-sensitive.
- **`advance_status` picks the next status inside the `UPDATE`**, via a parameterised `CASE`. Reading the row and writing the successor back would need an explicit `SELECT ... FOR UPDATE` — a bare `SELECT` takes no row lock, so two clicks arriving together would both read the same status and one would be lost.
- **The app never issues DDL.** The schema lives in [supabase/migrations/0001_create_leads.sql](supabase/migrations/0001_create_leads.sql) and is applied by hand, once. A startup hook runs on *every* cold start on Vercel, which would mean many instances racing to `CREATE TABLE` against a shared database. Seeding moved there too, and the old "seed only on the first run, never merely when the table is empty" rule is carried by the `where not exists (select 1 from public.leads)` on the seed insert. **`on conflict do nothing` does not enforce it** — that clause only swallows duplicate-key errors, so deleting a seed and re-pasting the migration would bring it straight back.
- **RLS is enabled on `leads` with no policies, deliberately.** Supabase exposes every `public` table through PostgREST to anyone holding the anon key, which is designed to ship in browser code. No policies means PostgREST is denied outright; the backend is unaffected because it connects as the table owner, which bypasses RLS. Don't "fix" the missing policy without deciding to open that API up.
- `created_at` is a **`timestamptz`** but is serialised as `yyyy-mm-dd`. The time component only exists so `ORDER BY created_at DESC` is stable — with dates alone, leads added the same day come back in arbitrary order. The date alone is what `formatLeadDate` parses.
- `LeadOut` uses `alias_generator=to_camel`, so responses match the TS `Lead` type field for field. That is why `src/lib/api.ts` is a fetch wrapper with **no renaming layer** — keep it that way.
- The pipeline order is spelled out in four places now: `db.LEAD_STATUSES`, `repository.NEXT_STATUS`, `schemas.LeadStatus`, and the `CHECK` constraint in the migration. A module-level `assert` in `schemas.py` holds the first three together; the fourth is SQL and cannot be asserted from Python, so **changing a status name means editing the migration too** — otherwise the insert fails the constraint at runtime. Advancing is a **server** decision; the client's `nextStatus` only predicts it.

### Deployment

One Vercel project serves both halves. Next.js is the framework preset; the FastAPI app rides along as a Python serverless function.

- [api/index.py](api/index.py) is the entry point. Vercel serves any `app` in `api/*.py` that speaks ASGI — no uvicorn, no port. It puts `backend/` on `sys.path` and imports `app.main`, matching how uvicorn runs locally, so there is only one import root to reason about.
- [vercel.json](vercel.json) rewrites `/api/(.*)` onto that single function, so FastAPI keeps doing its own routing, and `includeFiles` pulls `backend/**` into the bundle — without it the function ships as one file and the import fails.
- The root [requirements.txt](requirements.txt) is just `-r backend/requirements.txt`. Vercel installs from the root; pointing it at the backend's own list keeps one source of truth so a dependency added for local dev can't be missing in production.
- `DATABASE_URL` is set as a Vercel Environment Variable, never in a committed file. It contains the database password.

### Lead state (frontend)

[src/context/LeadsContext.tsx](src/context/LeadsContext.tsx) owns the client-side view of the data and every mutation. The source of truth is the database; this is a cache of it. [src/lib/api.ts](src/lib/api.ts) is the only module that calls `fetch`.

- **`isLoaded` is not decoration.** State starts empty so the prerendered HTML matches the first client render, then the list arrives from the API in an effect. It is set to `true` **even when the load fails**, or the table would sit on "Loading leads…" forever with nothing to explain why. Components must render a loading branch rather than assuming an empty list means "no leads". This is also why the file carries a targeted `eslint-disable` for `react-hooks/set-state-in-effect`.
- **Mutations are optimistic with rollback.** Apply locally → send → replace the row with the server's response, or restore and set `error`. Properties to preserve: rollback addresses rows **by id inside functional `setLeads` updaters**, and previous values are read from `leadsRef` rather than captured inside an updater (updaters must stay pure).
- **Concurrent edits to one row are sequenced.** `rowRequests` gives each in-flight mutation a number, and only the newest response for a row may touch it — otherwise a double-clicked badge whose responses arrive out of order leaves the table a step behind the database. Its `baseline` is the row before the *first* request of a burst, which is what a failure must restore; the row on screen already carries the optimistic edits being undone. `updateLead` rolls back **only the fields its patch touched**, so it can't undo a status advance that succeeded meanwhile.
- **`deleteLead` restores by anchor, not index**: it remembers the id of the row that followed, because a numeric index captured before the request goes stale if the list changes underneath it.
- **Temp ids.** `addLead` shows a placeholder row with a `temp-` id while the POST is in flight. The other mutations refuse `temp-` ids with a message — the server has never heard of them, so a request could only 404.
- `nextStatus` wraps `Closed → New` on purpose: clicking is the only way to change status, so wrapping is what makes a mis-click recoverable.
- Network failures surface through `LeadsErrorBanner`, rendered on both pages. Without it, a rolled-back optimistic update just looks like the click not registering.

### Component layers

Distinguish the two, because they have different rules:

- `src/components/leads/*` — **this app's** components. Edit freely.
- `src/components/ui/*`, `src/components/form/*`, `src/layout/*`, `src/components/common/*` — **template** components. Prefer composing over rewriting: `StatusPill` wraps `Badge` rather than restyling a pill from scratch, which keeps one source of truth for pill styling.

`LeadsTable` is shared by both pages — the Dashboard passes a sliced list, and omits `onEdit` so no pencil button renders there. Status colours live in one map in [src/components/leads/StatusPill.tsx](src/components/leads/StatusPill.tsx).

`LeadFormModal` serves both adding and editing. Its fields are **fully controlled**, and capped with `MAX_LENGTH`, which mirrors the `StringConstraints` in `backend/app/schemas.py` — without that, a long paste is accepted, the modal closes, and only then does the API 422.

`useState(initialDraft)` initialises once per mount and `Modal` unmounts its children rather than the form component, so the CRM page keys the form on a **counter bumped on every open**. Keying on the lead id would not change when the same row is edited twice in a row, leaving stale text in the fields — and saving would then write the first edit back over the second.

Saving is fire-and-close, so a failed request would take the typed draft with it. `addLead`/`updateLead` therefore resolve to a boolean, and the CRM page reopens the form holding the same draft when one resolves false.

### Deviations from the template worth knowing

These were changed for cause; don't "restore" them by copying the upstream file back:

- `Button` gained a `type` prop defaulting to `"button"` — without it, a Cancel button inside a `<form>` submits it.
- `AppHeader`'s search `<form>` has no action and no handler, so **any** submit — Enter in the field, or the decorative ⌘K keycap, which defaulted to `type="submit"` — fired a native GET navigation that reloaded the page and discarded React state. It now calls `preventDefault`, and the keycap is `type="button"`.
- `TextArea` gained an `id` prop; without it a `<Label htmlFor>` pointed at nothing and the field had no accessible name.
- `Input` gained a `value` prop. It shipped with `defaultValue` only, so a field could never start with anything in it — `LeadFormModal` needs controlled inputs to prefill an edit. `value` and `defaultValue` are spread conditionally so React never sees both.
- `TableCell` gained `colSpan`, used by the table's loading and empty rows so a single message spans all 7 columns instead of sitting in the first.
- `TextArea` used `text-gray-400` for its **value**, rendering typed text like placeholder grey. Now `text-gray-800` + `placeholder:text-gray-400`.
- Neither `AppHeader` nor `AppSidebar` renders the template's wordmark SVGs any more. Those baked "TailAdmin" into outlined paths — so the name could not be retyped — and each needed a light/dark `<Image>` pair to swap. [src/layout/BrandLogo.tsx](src/layout/BrandLogo.tsx) composes `logo-icon.svg` with real text instead: one element covers both themes, and `showWordmark={false}` gives the collapsed sidebar the mark alone. Rename the brand there, not in an asset.
- `NotificationDropdown` and `UserDropdown` shipped ~380 lines of fabricated notifications and links to `/profile`, `/signin`, and a support page. Those routes don't exist here, so both were reduced to honest empty/summary states. Don't reintroduce demo content or dead links.

## Styling — always use Tailwind CSS

**All UI must be built with Tailwind CSS utility classes.** No new hand-authored CSS files, CSS modules, inline `style` objects, or additional CSS frameworks.

- Reach for utilities in JSX first. When a pattern genuinely repeats, extract a React component rather than a bespoke CSS class.
- Escape hatches (`@apply`, arbitrary values like `w-[290px]`, `style` for runtime-only values) are fine when a utility can't express the need — keep them rare and local.
- Extend design tokens in the `@theme` block rather than hardcoding one-off values.

### How it's wired

Tailwind **v4**, configured from CSS — there is deliberately **no `tailwind.config.js`**:

- [src/app/globals.css](src/app/globals.css) starts with `@import 'tailwindcss'`, then `@custom-variant dark` (class-based, driven by `ThemeContext` toggling `.dark` on `<html>` — *not* `prefers-color-scheme`), then a large `@theme` block.
- `ThemeContext` only applies the class after mount, which painted a white screen first for dark-mode visitors. A small blocking `themeScript` in [src/app/layout.tsx](src/app/layout.tsx) sets the class before first paint; `<html>` therefore carries `suppressHydrationWarning`, since React would otherwise flag the pre-hydration attribute change as a mismatch. **If you change the `theme` storage key or the `dark` class name, change it in both places.**
- The template's design tokens live in that `@theme` block: `brand-*`, `success-*`, `error-*`, `warning-*`, `blue-light-*`, `gray-*`, plus `text-theme-*` / `text-title-*` type scales and `shadow-theme-*`. **Use these instead of raw Tailwind palette colours** — `text-theme-sm` and `bg-brand-500` are the house style, and mixing in `text-sm`/`bg-blue-500` is what makes new UI look bolted on.
- Sidebar menu classes (`menu-item`, `menu-item-active`, …) are `@utility` definitions in the same file.
- This project uses PostCSS (`@tailwindcss/postcss`), not the Vite plugin.

### Every new UI element needs a dark variant

Dark mode is wired up and works. Pair each light style with its dark counterpart (`text-gray-800 dark:text-white/90`, `border-gray-200 dark:border-gray-800`, `bg-white dark:bg-white/[0.03]`) — an element styled for light only visibly breaks the dark theme.

## Assets and icons

- SVGs in `src/icons/` are imported as **React components** via `@svgr/webpack`, configured for both webpack and Turbopack in [next.config.ts](next.config.ts). Import from the `@/icons` barrel: `import { TrashBinIcon } from '@/icons'`.
- `public/images/` holds exactly two files: `logo/logo-icon.svg` (the mark, no wordmark — see `BrandLogo` above) and `user/owner-photo.jpg`. The template's other image folders were dropped, so a copied-in template component may reference an image that no longer exists — check before reusing one.
- **Swapping an image means renaming the file, not overwriting it.** `/_next/image` keys its cache on path + width + quality, never on content, so the same filename keeps serving the old bytes — clearing `.next/cache/images`, restarting the dev server, hard-reloading, and opening a fresh tab all fail to dislodge it, and in production a CDN would hold it far longer. That is why the avatar is `owner-photo.jpg` rather than the template's `owner.jpg`.
- `@/*` maps to `./src/*`.
