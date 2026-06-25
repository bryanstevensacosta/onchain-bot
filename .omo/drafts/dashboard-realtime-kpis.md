---
slug: dashboard-realtime-kpis
status: plan-written
intent: clear
pending-action: awaiting $start-work (or high-accuracy review opt-in)
approach: One plan, 3 sequential phases (Fix #0 wire-up → Phase 1 in-memory TTL cache → Phase 2 WebSocket push + missedSince). Reuses existing infra (WsGateway, useEventStream, RedisModule-global, EventEmitter2-global). Zero new npm packages. Plan file at .omo/plans/dashboard-realtime-kpis.md (386 lines, 15 tasks: 11 main + 4 final-verification).
---

# Draft: dashboard-realtime-kpis

## Components (topology ledger)

| id | outcome | status | evidence |
|---|---|---|---|
| C1 | Wire dashboard BC → frontend. `KpiCards` consumes `/dashboard/kpis` via TanStack Query. Fixes `publishedCount=0` side-effect (the wrong `/vip-calls/...` URLs in `endpoints.ts:10-15` are no longer reached). | active | `apps/frontend/src/widgets/kpi-cards/ui/kpi-cards.tsx:9-12` (current 4 calls); `apps/backend/src/dashboard/dashboard.module.ts` (BC exists, endpoint exists) |
| C2 | 1s in-memory TTL cache for `DashboardKpis`. New `DashboardKpisCachePort` + `InMemoryDashboardKpisCacheRepository`. `GetDashboardKpisUseCase.execute` reads cache first. | active | `apps/backend/src/dashboard/application/handlers/get-dashboard-kpis.use-case.ts:26-46` (current execute body); `apps/backend/src/chain/detection/infrastructure/repositories/in-memory-chain-detection.repository.ts:6-36` (in-memory pattern reference) |
| C3 | WebSocket push. Dashboard BC subscribes to 4 pipeline events (`normalization.call.normalized`, `filters.token.approved`, `filters.token.rejected`, `publishing.telegram.published`); emits new `KpisUpdatedEvent`; gateway maps it to `dashboard.kpis.updated`; frontend `useDashboardKpis` hook subscribes via `useEventStream` + 30s polling backstop. `WsGateway.handleConnection` populates `missedSince` with the timestamp of the last forwarded event. | active | `apps/backend/src/shared/ws/gateway/ws.gateway.ts:24-115` (gateway + EVENT_MAP); `apps/frontend/src/shared/realtime/use-event-stream.ts:5-19` (hook); `apps/frontend/src/shared/realtime/events.ts:117-136` (ServerHello + WS_EVENTS) |

## Open assumptions (announced defaults)

| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Test strategy | tests-after for C1 (small frontend change); TDD for C2 (new port + adapter + spec); TDD for C3 (handlers + gateway spec + frontend event-stream test) | C1 is a refactor with 4-call → 1-call; C2/C3 introduce new contracts worth TDD | yes |
| Cache invalidation in C2 | TTL-only (no event-driven in C2) | event-driven invalidation comes naturally in C3 when the BC subscribes | yes |
| Frontend polling backstop after C3 | `useQuery` with `refetchInterval: 30_000` | safety net for disconnects >30s; WS push keeps it fresh in <1s under normal load | yes |
| Kol lifecycle in WS push | NOT included | `SetKolLifecycleUseCase` does not emit events; `Kol.activate/dormant/blacklist` mutate without events (`apps/backend/src/kol/identity/domain/entities/kol.entity.ts:112-124`). Lifecycle changes are admin-triggered (rare); 30s polling backstop handles. | yes (could add a `KolLifecycleChangedEvent` in a future refactor) |
| KOL registration in WS push | NOT included | `Kol.create` emits no event (`kol.entity.ts:40-57`); `RegisterKolUseCase.execute` calls `kol.commit()` which is empty for `Kol.create`. Same rationale: admin-triggered, rare. | yes |
| `refetchOnWindowFocus` | false (codebase default) | no change | yes |
| New npm packages | none | `socket.io-client`, `@nestjs/event-emitter`, `@nestjs/websockets`, `@tanstack/react-query` all already installed | n/a |
| TypeORM schema changes | none | cache is in-memory; no new entities; `chain_detection_results` table already covers the dashboard BC's needs if persisted later | yes |
| `EVENT_MAP` extension | `'dashboard.kpis.updated': 'dashboard.kpis.updated'` (1:1) | consistent with existing entries that pass through unchanged | yes |
| `ServerHello.missedSince` semantics | timestamp of the last event forwarded by the gateway (any event, not just KPI) | frontend logs it for diagnostics; client does NOT replay events — it GETs the current snapshot on reconnect via `useDashboardKpis`'s HTTP path | yes |

## Findings (cited - path:lines)

- Dashboard BC exists but unused: `apps/backend/src/dashboard/` (4 files: module, controller, use case, port + spec)
- Frontend does 4 fetches/5s for KPIs: `apps/frontend/src/widgets/kpi-cards/ui/kpi-cards.tsx:9-12`
- Wrong publishing URL bug in frontend: `apps/frontend/src/shared/api/endpoints.ts:10-15` (uses `/vip-calls/...` instead of correct path)
- WsGateway listens to ALL events and maps via EVENT_MAP: `apps/backend/src/shared/ws/gateway/ws.gateway.ts:24-115`
- WS_EVENTS enum must be extended: `apps/frontend/src/shared/realtime/events.ts:123-136`
- useEventStream hook ready: `apps/frontend/src/shared/realtime/use-event-stream.ts:5-19`
- In-memory pattern: `apps/backend/src/chain/detection/infrastructure/repositories/in-memory-chain-detection.repository.ts:6-36`
- RedisModule global: `apps/backend/src/shared/common/cache/redis.module.ts` (imported in `app.module.ts`)
- EventEmitterModule global: `apps/backend/src/app.module.ts` (`EventEmitterModule.forRoot({ global: true, wildcard: false })`)
- AppModule already imports DashboardModule, WsModule, RedisModule: `apps/backend/src/app.module.ts`
- Kol lifecycle events: NONE. `SetKolLifecycleUseCase` mutates without event emission: `apps/backend/src/kol/identity/application/handlers/set-kol-lifecycle.use-case.ts:32-44`
- Kol.create emits no event: `apps/backend/src/kol/identity/domain/entities/kol.entity.ts:40-57`
- 5s polling precedent: `apps/frontend/src/entities/filter-decision/model/use-decisions.ts:9-14` (`refetchInterval: 5_000`)
- Entity pattern reference: `apps/frontend/src/entities/filter-decision/{api,model,index.ts}`

## Decisions (with rationale)

See "Open assumptions" above — all are reversible defaults announced before the gate.

## Scope IN

- C1: new `apps/frontend/src/entities/dashboard/{api,model,index.ts}` + refactor `widgets/kpi-cards/ui/kpi-cards.tsx`
- C2: new `apps/backend/src/dashboard/application/ports/dashboard-kpis-cache.port.ts` + `infrastructure/repositories/in-memory-dashboard-kpis-cache.repository.ts` + modify `get-dashboard-kpis.use-case.ts` + modify spec
- C3: new `apps/backend/src/dashboard/domain/events/kpis-updated.event.ts` + `application/ports/kpis-updated-event.publisher.ts` + `infrastructure/messaging/in-process-kpis-updated-event.publisher.ts` + `application/services/refresh-kpis.service.ts` + `infrastructure/event-bus/{normalization,filters-approved,filters-rejected,publishing-published}.handler.ts` (4 files) + modify `dashboard.module.ts` + modify `shared/ws/gateway/ws.gateway.ts` (add to EVENT_MAP + implement missedSince) + frontend `shared/realtime/events.ts` (add WS_EVENTS entry) + refactor `useDashboardKpis` hook + spec additions
- `apps/backend/src/dashboard/application/handlers/get-dashboard-kpis.use-case.spec.ts`: add cache hit/miss/expiry scenarios
- `apps/backend/src/shared/ws/gateway/ws.gateway.spec.ts` (NEW): test missedSince + EVENT_MAP passthrough for dashboard.kpis.updated

## Scope OUT (Must NOT have)

- Replacing the dashboard BC with raw polling on 4 endpoints (rejected at gate)
- Caching individual source repos (the use case already parallelizes them; no benefit)
- Multi-instance Redis cache (deferred; 1s in-memory is sufficient for dev + single-instance prod)
- EventEmitter2 wildcards or outbox pattern (separate concern)
- Skeleton loading state in `KpiCards` (separate task — known gap per frontend README)
- React error boundaries (separate task — known gap)
- Fixing duplicate types `entities/*` ↔ `shared/realtime/events.ts` (separate task — known gap)
- Promoting `TokenScoredEvent` to `shared/common/events/` (separate suggestion)
- Adding a `KolLifecycleChangedEvent` to kol/identity BC (out of scope; lifecycle covered by polling backstop)
- Changing `setKolLifecycle` HTTP endpoint or adding a new BC for it
- Changing existing cache TTL pattern (this plan introduces the first one)

## Open questions

None remaining at gate. All forks resolved with the user.

## Approval gate
status: plan-delivered → awaiting user decision (start or high-accuracy review)

## Metis findings (folded in)

1 BLOCKER + 5 WARNINGs + ~10 NITs. All folded into the plan. Most important fixes applied:
- Existing 2-call test in `get-dashboard-kpis.use-case.spec.ts:134-151` modified to expect cache hit (1 call) instead of 2.
- `DASHBOARD_CACHE_TTL_MS` constant moved to `dashboard-kpis-cache.port.ts` (architectural alignment).
- `EVENT_MAP` and `WS_EVENTS` count expectations corrected (11→12, 12→13).
- Commit strategy 3a/3b ordering clarified: 3a MUST precede 3b (matrix says so).
- WS reconnect `missedSince` assertion added to WsGateway spec (was unenforced).
- Manual browser QA replaced with Playwright MCP + `curl` + Node socket.io-client scripts.

## Plan file summary

- `.omo/plans/dashboard-realtime-kpis.md`: 381 lines, 15 tasks (11 main + 4 final-verification)
- 8 top-level sections: TL;DR, Scope, Verification strategy, Execution strategy, Todos, Final verification wave, Commit strategy, Success criteria
- 3 sequential phases (Wave 1: 3 todos; Wave 2: 2 todos; Wave 3: 6 todos)
- 4 atomic commits planned (1, 2, 3a, 3b)
- Zero new npm packages; zero schema changes; no changes to `apps/backend/src/app.module.ts`
