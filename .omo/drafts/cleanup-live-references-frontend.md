---
slug: cleanup-live-references-frontend
status: drafting
intent: clear
pending-action: write .omo/plans/cleanup-live-references-frontend.md
approach: Remove the zombie `/live` route and its nav link from the frontend; preserve the LiveFeed widget on the Dashboard.
---

# Draft: cleanup-live-references-frontend

## Components (topology ledger)
| id | outcome | status | evidence path |
|----|---------|--------|---------------|
| C1 | Remove nav link "Live" from header | active | root-layout.tsx:5 |
| C2 | Remove `/live` route redirect | active | routes.tsx:19 |
| C3 | Update frontend README to remove `/live` page doc | active | apps/frontend/README.md |
| C4 | Preserve LiveFeed widget + Dashboard import | deferred (no-op) | live-feed/**, dashboard/index.tsx:2,14 |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|-----------|----------------|-----------|-------------|
| No other files reference "/live" route | Already confirmed via grep | No other file imports or links to `/live` | Yes |

## Findings (cited - path:lines)
- `apps/frontend/src/app/layouts/root-layout.tsx:5` — `{ to: '/live', label: 'Live' }` in NAV array
- `apps/frontend/src/app/router/routes.tsx:19` — `{ path: 'live', element: <Navigate to="/tokens" replace /> }`
- `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx` — LiveFeed component (248 lines, WS events)
- `apps/frontend/src/pages/dashboard/index.tsx:2,14` — imports and renders `<LiveFeed />`
- `apps/frontend/README.md` — documents `/live` as a separate page
- `apps/frontend/AGENTS.md:106` — documents `/live` redirect behavior
- Backend references (18 files) are all unrelated (LiveMarketDataPort, etc.) — no-touch

## Decisions (with rationale)
- **Opción A elegida por el usuario**: eliminar nav link + ruta zombie, preservar LiveFeed en Dashboard.
- Widget LiveFeed se queda porque el usuario no pidió eliminarlo y sigue siendo útil dentro del Dashboard.
- No se toca el backend — todas las referencias a "live" allí son legítimas (infraestructura de market data).

## Scope IN
1. root-layout.tsx: eliminar entrada `{ to: '/live', label: 'Live' }` del array NAV
2. routes.tsx: eliminar línea `{ path: 'live', element: <Navigate to="/tokens" replace /> }`
3. apps/frontend/README.md: eliminar mención de `/live` como ruta independiente
4. apps/frontend/AGENTS.md: eliminar línea "Live route — /live redirects to /tokens"

## Scope OUT (Must NOT have)
- NO eliminar el widget LiveFeed ni su barrel export
- NO eliminar el import de LiveFeed en dashboard/index.tsx
- NO tocar el backend
- NO modificar shared/realtime/ o events del WebSocket
- NO renombrar archivos ni carpetas

## Open questions
None — el usuario ya eligió Opción A explícitamente.

## Approval gate
status: approved
user: bryanstevens
decision: "si procede"
timestamp: 2026-06-30
