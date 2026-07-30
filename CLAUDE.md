# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Lead Finder Lite** — a deliberately minimal CRM built for a "vibe-to-live" workshop. Four capabilities, nothing more:

1. Add a lead (company, contact, title, one-line notes)
2. View leads in a table with a status pipeline
3. Advance status by clicking the badge: `New → Contacted → Replied → Closed`
4. A **research notes** field that students paste findings into **by hand**

There is **no scraping, enrichment, or external API call anywhere**, and that is a deliberate product constraint, not an unfinished edge — it keeps the class demo free and safe to run. Do not add live lookup, enrichment, or a data-provider integration unless explicitly asked. The original guide's 5-skill chain (ICP Builder → Prospect Finder → Company Spy → Message Crafter → Follow-Up Sequencer) is a post-workshop stretch goal, not the current scope.

## Commands

```bash
npm run dev      # Next.js dev server (Turbopack) on :3000
npm run build    # production build; also runs the TypeScript check
npm run start    # serve the production build
npm run lint     # eslint (eslint-config-next)
```

There is **no test runner installed** — don't assume `npm test` exists. `npm run build` is the type-check gate.

## Architecture

Built on the **TailAdmin free Next.js template**, trimmed to just this app. Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4.

### Routing and layout

Two pages, both `'use client'` because they read lead state from context:

- `src/app/(admin)/page.tsx` — Dashboard: stat cards + 5 most recent leads
- `src/app/(admin)/crm/page.tsx` — CRM: full table + Add lead modal

The `(admin)` route group owns the chrome. [src/app/(admin)/layout.tsx](src/app/(admin)/layout.tsx) composes `AppSidebar` + `AppHeader` + `Backdrop` and computes the main content's left margin from sidebar state — so a new page dropped into `(admin)/` inherits the shell with no wiring. [src/app/layout.tsx](src/app/layout.tsx) holds the three providers: `ThemeProvider` → `SidebarProvider` → `LeadsProvider`.

### Lead state

[src/context/LeadsContext.tsx](src/context/LeadsContext.tsx) is the single source of truth — all lead data and every mutation. There is no backend and no server state.

- **Persistence is `localStorage`** under `lead-finder-lite:leads`. First visit seeds three example leads.
- **`isLoaded` is not decoration.** `localStorage` is client-only, so state starts empty and hydrates in an effect; reading it in a `useState` initializer instead would make the first client render disagree with the prerendered HTML and trip a hydration error. Components must render a loading branch while `isLoaded` is false rather than assuming an empty list means "no leads". This is also why both context files carry a targeted `eslint-disable` for `react-hooks/set-state-in-effect` — that rule cannot model the hydration constraint.
- `readStoredLeads` returns a **tagged union** (`missing` | `unreadable` | `ok`), not `Lead[] | null`, and that distinction is load-bearing. It previously returned a filtered array, so "nothing saved yet" and "saved, but no row validates" both collapsed to `[]`: the seed fallback couldn't fire and the persist effect immediately overwrote storage with `[]`, destroying every saved lead. Adding a required field to `Lead` + `isLead` — step one in the README's stretch goals — was enough to trigger it. **Only `missing` seeds**, so deleting your last lead and reloading correctly stays empty instead of re-seeding, and anything unparseable or partially invalid is copied to `lead-finder-lite:leads:backup` with a `console.warn` before being replaced. Preserve those two properties when touching this code.
- `nextStatus` wraps `Closed → New` on purpose: clicking is the only way to change status, so wrapping is what makes a mis-click recoverable.

### Component layers

Distinguish the two, because they have different rules:

- `src/components/leads/*` — **this app's** components. Edit freely.
- `src/components/ui/*`, `src/components/form/*`, `src/layout/*`, `src/components/common/*` — **template** components. Prefer composing over rewriting: `StatusPill` wraps `Badge` rather than restyling a pill from scratch, which keeps one source of truth for pill styling.

`LeadsTable` is shared by both pages — the Dashboard passes a sliced list. Status colours live in one map in [src/components/leads/StatusPill.tsx](src/components/leads/StatusPill.tsx).

### Deviations from the template worth knowing

These were changed for cause; don't "restore" them by copying the upstream file back:

- `Button` gained a `type` prop defaulting to `"button"` — without it, a Cancel button inside a `<form>` submits it.
- `AppHeader`'s search `<form>` has no action and no handler, so **any** submit — Enter in the field, or the decorative ⌘K keycap, which defaulted to `type="submit"` — fired a native GET navigation that reloaded the page and discarded React state. It now calls `preventDefault`, and the keycap is `type="button"`.
- `TextArea` gained an `id` prop; without it a `<Label htmlFor>` pointed at nothing and the field had no accessible name.
- `TableCell` gained `colSpan`, used by the table's loading and empty rows so a single message spans all 7 columns instead of sitting in the first.
- `TextArea` used `text-gray-400` for its **value**, rendering typed text like placeholder grey. Now `text-gray-800` + `placeholder:text-gray-400`.
- `AppHeader`'s mobile logo used a relative `./images/...` path, which resolves to `/crm/images/...` on a nested route. Now absolute.
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
- `public/images/` holds only the logos and one avatar. The template's other image folders were dropped, so a copied-in template component may reference an image that no longer exists — check before reusing one.
- `@/*` maps to `./src/*`.
