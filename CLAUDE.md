# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Lead Finder Lite** — a deliberately minimal CRM built for a "vibe-to-live" workshop. Five capabilities, nothing more:

1. Add a lead (company, contact, title, one-line notes)
2. View leads in a table with a status pipeline
3. Edit a lead from its row in the CRM table
4. Advance status by clicking the badge: `New → Contacted → Replied → Closed`
5. A **research notes** field that students paste findings into **by hand**

There is **no scraping, enrichment, or third-party data provider anywhere**, and that is a deliberate product constraint, not an unfinished edge — it keeps the class demo free and safe to run. Do not add live lookup, enrichment, or a data-provider integration unless explicitly asked. (The app's *own* FastAPI backend is not an exception to this — the rule is about pulling in outside data.) The original guide's 5-skill chain (ICP Builder → Prospect Finder → Company Spy → Message Crafter → Follow-Up Sequencer) is a post-workshop stretch goal, not the current scope.

## Commands

Two processes. The web app is useless without the API — every lead read and write goes through it.

```bash
npm run dev      # Next.js dev server (Turbopack) on :3000
npm run dev:api  # FastAPI via backend/.venv on :8000
npm run build    # production build; also runs the TypeScript check
npm run start    # serve the production build
npm run lint     # eslint (eslint-config-next)
```

First-time backend setup: `cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`.

There is **no test runner installed** on either side — don't assume `npm test` or `pytest` exists. `npm run build` is the type-check gate for the frontend; for the backend, `curl` against a running `uvicorn` (or `/docs`) is the check.

## Architecture

Built on the **TailAdmin free Next.js template**, trimmed to just this app. Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4.

### Routing and layout

Two pages, both `'use client'` because they read lead state from context:

- `src/app/(admin)/page.tsx` — Dashboard: stat cards + 5 most recent leads
- `src/app/(admin)/crm/page.tsx` — CRM: full table + the add/edit modal

`/api/*` is **not** a Next.js route — there are no route handlers and no server actions. [next.config.ts](next.config.ts) rewrites it to the FastAPI app at `BACKEND_ORIGIN` (default `http://localhost:8000`), so the browser only ever makes same-origin requests and no API URL reaches the client bundle.

The `(admin)` route group owns the chrome. [src/app/(admin)/layout.tsx](src/app/(admin)/layout.tsx) composes `AppSidebar` + `AppHeader` + `Backdrop` and computes the main content's left margin from sidebar state — so a new page dropped into `(admin)/` inherits the shell with no wiring. [src/app/layout.tsx](src/app/layout.tsx) holds the three providers: `ThemeProvider` → `SidebarProvider` → `LeadsProvider`.

### Backend

[backend/](backend/) — FastAPI over a SQLite file, mounted at `/api`. Stdlib `sqlite3`, **no ORM**; `backend/README.md` has the endpoint table. Layers: `config` → `db` → `schemas` → `repository` → `routers/leads` → `main`.

- **All SQL lives in `repository.py`.** Everything is parameterised with `?`; the one place a column name varies at runtime (`update_lead`) picks it from the `UPDATABLE_COLUMNS` whitelist, never from the request body.
- **One connection per request**, via the `get_conn` dependency. Endpoints are sync `def` on purpose — FastAPI runs those in a threadpool, where blocking `sqlite3` calls are harmless; `async def` would block the event loop. A module-level connection would then be several requests deep at once, so don't hoist it.
- **`check_same_thread=False` is load-bearing, not a shortcut.** FastAPI runs a sync generator dependency and its endpoint in *different* threadpool threads, so the connection `get_conn` opens is always used from a thread other than the one that created it. Without the flag every overlapping request raises `ProgrammingError` — and sequential testing won't reveal it, because anyio hands out the same idle worker twice. The flag only disables sqlite3's guard against *sharing* a connection; per-request construction is what actually keeps this safe.
- **`advance_status` picks the next status inside the `UPDATE`**, via a parameterised `CASE`. Reading the row and writing the successor back would need an explicit `BEGIN IMMEDIATE` — a bare `SELECT` starts no transaction, so two clicks arriving together would both read the same status and one would be lost.
- **Seeding fires only when the `leads` table did not exist**, checked against `sqlite_master` before `CREATE TABLE` — never merely when the table is empty. This is the same trap the old `localStorage` code hit: seeding an empty table resurrects the three examples every time someone deletes their last lead and restarts. Preserve it.
- `created_at` is stored as a **full ISO timestamp** but serialised as `yyyy-mm-dd`. The time component only exists so `ORDER BY created_at DESC` is stable — with dates alone, leads added the same day come back in arbitrary order. The date alone is what `formatLeadDate` parses.
- `LeadOut` uses `alias_generator=to_camel`, so responses match the TS `Lead` type field for field. That is why `src/lib/api.ts` is a fetch wrapper with **no renaming layer** — keep it that way.
- The pipeline order is spelled out in `db.LEAD_STATUSES` (which builds the table's `CHECK` constraint), `repository.NEXT_STATUS`, and `schemas.LeadStatus`; a module-level `assert` in `schemas.py` holds the last two together. Advancing is a **server** decision — the client's `nextStatus` only predicts it.

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
