# apps/frontend/ — React/Vite Dashboard (Feature-Sliced Design)

## OVERVIEW

React 18 + Vite 5 dashboard with TanStack Query + Socket.IO for real-time updates. Follows Feature-Sliced Design (FSD) strictly. Dev server runs on port 5173 (strictPort).

## STRUCTURE

| Layer | Responsibility | Subdirs | Example |
|-------|----------------|---------|---------|
| `app/` | Entry, routing, providers | router/, providers/, layouts/, styles/ | index.tsx exports App component |
| `pages/` | Page-level routes (one file per route) | (flat) | dashboard.tsx, tokens-explorer.tsx |
| `widgets/` | Composite UI blocks | ui/, api/, index.ts | KpiCards, LiveFeed, TopTokensTable |
| `features/` | User actions (mutations) | ui/, api/, model/, index.ts | trigger-backfill, add-kol |
| `entities/` | Domain models | api/, model/, ui/ | kol, canonical-call, token-score |
| `shared/` | Cross-cutting utilities | api/, lib/, realtime/, ui/ | http-client, format, socket |

## WHERE TO LOOK

| Task | Path |
|------|------|
| Add a new page | `pages/` — create `{name}.tsx`, wire in `app/router/routes.tsx` |
| Add a feature (mutation) | `features/` — create folder with `ui/`, `api/`, `model/`, `index.ts` |
| Add an entity | `entities/` — create folder with `api/`, `model/`, `ui/` |
| Add a widget | `widgets/` — create folder with `ui/`, `api/`, `index.ts` |
| Add a UI primitive | `shared/ui/` — button.tsx, badge.tsx, modal.tsx, etc. |
| Wire a real-time event | `shared/realtime/` — events.ts defines event types, components use `useEventStream` |
| Configure Vite proxy | `vite.config.ts` — `/api` and `/socket.io` rewrite rules |
| TanStack Query config | `app/providers/query-provider.tsx` — staleTime: 5s, retry: 1 |

## CODE MAP

| Symbol | File | Role |
|--------|------|------|
| `App` | `app/index.tsx` | Root component: QueryProvider → SocketProvider → AppRouter |
| `RootLayout` | `app/layouts/root-layout.tsx` | Header nav + `<Outlet/>` for page layouts |
| `QueryProvider` | `app/providers/query-provider.tsx` | TanStack Query setup with app-wide config |
| `SocketProvider` | `app/providers/socket-provider.tsx` | Socket.IO connection context |
| `routes` | `app/router/routes.tsx` | Route definitions: `/`, `/tokens`, `/tokens/:chain/:address`, `/kols`, `/ops` |
| `httpClient` | `shared/api/http-client.ts` | Axios instance with interceptors |
| `useEventStream` | `shared/realtime/use-event-stream.ts` | Hook for subscribing to socket events |

## CONVENTIONS

### FSD Layer Rules (CRITICAL)

Imports flow downward only. Each layer may only depend on layers above it:

```
app → pages → widgets → features → entities → shared
```

Explicitly forbidden: `features` importing from `widgets`, `widgets` importing from `pages`, `entities` importing from `features`, etc.

### Per-Layer Subdir Pattern

- `features/*/`: `ui/`, `api/`, `model/`, `index.ts` (4 items minimum)
- `entities/*/`: `api/`, `model/`, `ui/` (3 items minimum)
- `widgets/*/`: `ui/`, `api/`, `index.ts` (3 items minimum)
- `shared/*/`: split by concern (`api/`, `lib/`, `realtime/`, `ui/`)

### TanStack Query Config

- `staleTime: 5s` — data fresh for 5 seconds
- `retry: 1` — single retry on failure
- `refetchOnWindowFocus: false` — no refetch on focus
- Query key pattern: `['entity', id, params]` (array format)

### No Data Router / Loaders

React Router v6 without data router. TanStack Query owns all server state. Loaders are NOT used — queries fetch on mount, mutations invalidate on success.

## ANTI-PATTERNS

- **No upward FSD imports** — features cannot import widgets, widgets cannot import pages
- **No Zustand or Redux** — TanStack Query handles all state (zustand in deps but unused)
- **No CSS-in-JS** — Tailwind CSS utility classes only
- **No relative `../../../` chains** — use `@/` alias (e.g., `@/features/add-kol`)
- **No data router or loaders** — QueryProvider owns server state, not React Router
- **No MSW without consulting** — MSW 2.6 in deps but not wired; don't add without discussion

## UNIQUE STYLES

- **Authentic FSD** — this is not a variant. Follow the layer hierarchy strictly.
- **Zustand unused** — zustand is in package.json but not used anywhere. Do not add it.
- **MSW not wired** — mock service worker is in deps but not configured. Tests use Vitest directly.
- **Type duplication** — `Chain` and `ScoreTier` appear in both `entities/*/model/` and `shared/realtime/events.ts`. Keep them in sync manually.

## COMMANDS

```bash
cd apps/frontend
npm run dev          # Vite dev server on port 5173
npm run build        # Production build
npm run test         # Vitest (co-located *.test.tsx)
npm run lint         # ESLint flat config
npm run format       # Prettier --write
```

## NOTES

- **Strict port** — Vite exits if 5173 is held. Run `npm run dev` from root (runs `scripts/cleanup-ports.mjs` first).
- **@/ alias** — frontend-only. Do NOT use in backend imports.
- **MSW status** — installed but not configured. Add `src/mocks/handlers.ts` and wire in `test/setup.ts` if needed.
- **Zustand status** — DO NOT add. All state lives in TanStack Query cache + socket subscriptions.
