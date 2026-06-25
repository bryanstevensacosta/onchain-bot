# dashboard-realtime-kpis - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** The 4 KPI cards on the dashboard will update in real time as the pipeline runs, driven by a WebSocket push instead of repeated HTTP polling. The published-count card will also stop showing zero (it was hitting a typo'd URL).

**Why this approach:** Three sequential phases — wire the existing dashboard endpoint to the widget (quick win), add a 1-second in-memory cache to defend against aggressive polling, then convert to push (the real win) by making the dashboard backend listen to pipeline events and broadcast updates. All infra (WebSocket gateway, event bus, hooks) already exists — no new libraries, no architectural changes.

**What it will NOT do:** No multi-instance cache, no Kol lifecycle events (handled by the polling backstop), no removal of polling entirely (the 30-second backstop stays as a safety net for WS disconnects), no new npm packages, no schema changes.

**Effort:** Medium
**Risk:** Low - reuses existing infrastructure; each phase is independently shippable; existing test suite will surface regressions immediately.
**Decisions to sanity-check:** (1) 1s cache TTL — short enough to feel real-time, long enough to absorb a polling burst; (2) 30s WS-disconnect backstop — long enough not to thrash the backend, short enough to recover quickly; (3) KOL register/lifecycle KPIs stay polling-driven (no events exist in `kol/identity` to subscribe to).

Your next move: approve the plan (or ask for a high-accuracy review first); execution begins only when you say `$start-work`. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, Low risk. 11 todos + 4 final-verification reviews across 3 sequential phases. Reuses existing infra. Zero new npm packages. 4 atomic commits.

## Scope
### Must have

**Wave 1 — Fix #0 (frontend wire-up)**
- New `apps/frontend/src/entities/dashboard/` directory with `api/dashboard-queries.ts` (query keys + `fetchDashboardKpis`), `model/types.ts` (`DashboardKpisView`), `model/use-dashboard-kpis.ts` (TanStack hook with `refetchInterval: 5_000`), `index.ts` (barrel)
- Refactor `apps/frontend/src/widgets/kpi-cards/ui/kpi-cards.tsx` to consume `useDashboardKpis()` instead of 4 separate hooks
- Remove now-unused imports (`useKols`, `useRecentCanonical`, `useRecentDecisions`, `usePublished`) from KpiCards
- Verification: `npm run build` exits 0; dashboard page loads; Network tab shows 1 request to `/dashboard/kpis` per 5s (was 4)

**Wave 2 — Phase 1 (in-memory TTL cache)**
- New `apps/backend/src/dashboard/application/ports/dashboard-kpis-cache.port.ts` (abstract class with `get()` / `set(value, ttlMs)` / `invalidate()`; export `DASHBOARD_CACHE_TTL_MS = 1000` from this file)
- New `apps/backend/src/dashboard/infrastructure/repositories/in-memory-dashboard-kpis-cache.repository.ts` (single key `'global'`, no LRU)
- New `DASHBOARD_CACHE_TTL_MS` constant exported from `apps/backend/src/dashboard/application/ports/dashboard-kpis-cache.port.ts` (default 1000)
- Modify `get-dashboard-kpis.use-case.ts` to check cache first, recompute on miss, write on compute
- Modify `dashboard.module.ts` to provide the cache adapter via simple `useClass: InMemoryDashboardKpisCacheRepository` (single impl; no factory needed)
- Update `get-dashboard-kpis.use-case.spec.ts` with cache hit / miss / expiry scenarios (TDD: spec first) AND modify the existing 2-call test at `:134-151` to reflect cache behavior
- Verification: `npm run test:backend -- --testPathPattern=get-dashboard-kpis` passes; cache hit shows zero repo calls

**Wave 3 — Phase 2 (WebSocket push + reconnect snapshot)**
- New `apps/backend/src/dashboard/domain/events/kpis-updated.event.ts` extending `DomainEvent`, `eventName = 'dashboard.kpis.updated'`, payload mirrors `DashboardKpis` + `updatedAt`
- New `apps/backend/src/dashboard/application/ports/kpis-updated-event.publisher.ts` (abstract class)
- New `apps/backend/src/dashboard/infrastructure/messaging/in-process-kpis-updated-event.publisher.ts` (wraps `EventEmitter2`)
- New `apps/backend/src/dashboard/application/services/refresh-kpis.service.ts` (orchestrator: invalidate cache → recompute via `GetDashboardKpisUseCase` → emit `KpisUpdatedEvent`)
- New `apps/backend/src/dashboard/infrastructure/event-bus/normalization.handler.ts` (`@OnEvent('normalization.call.normalized', { async: true })` → calls `refreshKpis.refresh()`)
- New `apps/backend/src/dashboard/infrastructure/event-bus/filters-approved.handler.ts` (`@OnEvent('filters.token.approved', ...)` → same)
- New `apps/backend/src/dashboard/infrastructure/event-bus/filters-rejected.handler.ts` (`@OnEvent('filters.token.rejected', ...)` → same)
- New `apps/backend/src/dashboard/infrastructure/event-bus/publishing-published.handler.ts` (`@OnEvent('publishing.telegram.published', ...)` → same)
- Modify `dashboard.module.ts` to wire the service + 4 handlers + publisher
- Modify `apps/backend/src/shared/ws/gateway/ws.gateway.ts:45-57` to add `'dashboard.kpis.updated': 'dashboard.kpis.updated'` to EVENT_MAP
- Modify `WsGateway` to track `lastEventTimestamp: number` (epoch ms) updated on every `handlePipelineEvent` call; `handleConnection` emits `hello` with `missedSince: lastEventTimestamp > 0 ? new Date(lastEventTimestamp).toISOString() : null` (replaces the current hardcoded `null`)
- New `apps/backend/src/shared/ws/gateway/ws.gateway.spec.ts`: test EVENT_MAP passthrough for `dashboard.kpis.updated` + test `handleConnection` populates `missedSince` correctly
- Frontend: extend `apps/frontend/src/shared/realtime/events.ts` with `KpisUpdated: 'dashboard.kpis.updated'` in `WS_EVENTS`
- Frontend: refactor `useDashboardKpis` to subscribe via `useEventStream('dashboard.kpis.updated', handler)` that calls `queryClient.setQueryData(['dashboard', 'kpis'], payload)`; keep `refetchInterval: 30_000` as backstop
- Verification: manual smoke — pipeline event triggers UI update within ~50ms; WS disconnect → KPIs still update every 30s

### Must NOT have (guardrails, anti-slop, scope boundaries)

- **Do not remove the dashboard BC.** It is the orchestrator that C2 and C3 both depend on.
- **Do not add `KolLifecycleChangedEvent` or `KolRegisteredEvent` to `kol/identity` BC.** Lifecycle/register KPIs are covered by the 30s polling backstop.
- **Do not change `EventEmitterModule.forRoot` config** (wildcard, delimiter, maxListeners) — keep the existing wiring intact.
- **Do not introduce Redis cache.** In-memory only this iteration; Redis is a documented future upgrade.
- **Do not introduce a new HTTP endpoint** (`/dashboard/kpis` already exists).
- **Do not change the `KpisUpdatedEvent` payload shape** after commit (other BCs do not depend on it, but it's a published contract — keep stable).
- **Do not add retries or backoff in event handlers.** Fire-and-log; pipeline already has idempotent writes.
- **Do not remove the polling backstop** after Phase 2 — it's the safety net for WS disconnects.
- **Do not change the existing `EVENT_MAP` entries** — only ADD the new `dashboard.kpis.updated` entry.
- **Do not change existing cache TTL pattern across other BCs** — this plan introduces the first TTL cache in the codebase; no scope creep to other BCs.
- **Do not promote VOs to `shared/common/value-objects/`** in this PR.
- **No new npm packages.**

## Verification strategy
> Zero human intervention - all verification is agent-executed.

- **Test decision**: tests-after for C1 (small frontend refactor; 4 calls → 1 call; existing build catches regressions). **TDD for C2 and C3**: write the spec first for the new port + adapter + handlers + WS gateway; the executor runs Jest until green before declaring the todo done.
- **Framework**: Jest (already configured in `apps/backend` per backend README). Frontend has no Jest setup today; the C1 refactor is small enough that `npm run build` + manual smoke is sufficient. If a frontend test infra gap is found during C3, the executor adds `vitest` only after explicit user approval (NOT in scope per "no new npm packages").
- **Backend test command**: `npm run test:backend -- --testPathPattern=<pattern>` for scoped runs; `npm run test:backend` for full suite before each commit.
- **Frontend build command**: `npm run build` (catches type errors and unused-import regressions in C1).
- **Lint**: `npm run lint` on changed files.
- **Evidence paths**:
  - `npm run build` stdout → `.omo/evidence/task-N-dashboard-realtime-kpis.build.log`
  - `npm run test:backend -- --testPathPattern=X` stdout → `.omo/evidence/task-N-dashboard-realtime-kpis.test.log`
  - Manual smoke results (commands run + observed output) → `.omo/evidence/task-N-dashboard-realtime-kpis.smoke.md`

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

**Wave 1 (Fix #0 — frontend wire-up)** — todos 1, 2, 3
- 1. Add dashboard entity (api/model/index)
- 2. Refactor KpiCards
- 3. Verify build + smoke

**Wave 2 (Phase 1 — in-memory TTL cache)** — todos 4, 5
- 4. Define DashboardKpisCachePort + implement InMemoryDashboardKpisCacheRepository (TDD)
- 5. Wire cache into GetDashboardKpisUseCase + extend spec (TDD via spec additions)

**Wave 3 (Phase 2 — WebSocket push + reconnect snapshot)** — todos 6, 7, 8, 9, 10, 11
- 6. Define `KpisUpdatedEvent` + `KpisUpdatedEventPublisher` port + `InProcessKpisUpdatedEventPublisher` (TDD)
- 7. Define `RefreshKpisService` orchestrator (TDD)
- 8. Add 4 `@OnEvent` handlers (normalization, filters-approved, filters-rejected, publishing-published) + wire dashboard.module.ts (TDD per handler)
- 9. Add `dashboard.kpis.updated` to `WsGateway.EVENT_MAP` + implement real `missedSince` (TDD via spec)
- 10. Frontend: extend `WS_EVENTS` + refactor `useDashboardKpis` to subscribe via `useEventStream` + 30s backstop
- 11. Final smoke (Wave 3 gate)

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | — | 2, 3 | — |
| 2 | 1 | 3 | — |
| 3 | 2 | 4, 5 (Wave 2) | — |
| 4 | 3 | 5 | — |
| 5 | 4 | 6, 7, 8, 9, 10, 11 (Wave 3) | — |
| 6 | 5 | 7 | — |
| 7 | 6 | 8 | — |
| 8 | 7 | 11 | 9 |
| 9 | — (only needs shared WsGateway) | 10 | 8 |
| 10 | 9, 1 (hook to refactor) | 11 | — |
| 11 | 10 | Final verification wave | — |

Notes:
- Wave 1 (todos 1-3) is independent of Wave 2 and Wave 3 — no backend changes in Wave 1.
- Wave 2 (todos 4-5) is backend-only — independent of Wave 1 in practice (frontend in Wave 1 just consumes the existing endpoint).
- Wave 3 (todos 6-11) depends on Wave 2 (cache layer) AND on Wave 1 (`useDashboardKpis` hook to refactor in todo 10).
- Within Wave 3, todos 8 and 9 can be worked in PARALLEL if two workers are available. Strictly, 8 (dashboard emits) and 9 (gateway maps) are independent — neither blocks the other. With one executor: serialize 8 → 9 for simplicity.
- Todo 10 strictly requires 9 (the EVENT_MAP entry must exist for the frontend's WS_EVENTS addition to make sense) and 1 (the hook file being there to refactor).

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

### Wave 1 — Fix #0 (frontend wire-up)

- [ ] 1. Add `dashboard` entity (api + model + types + index)
  What to do: Create the directory `apps/frontend/src/entities/dashboard/` with 4 files: (a) `api/dashboard-queries.ts` exporting `dashboardKeys` (query key factory following `decisionKeys` shape) and `fetchDashboardKpis(): Promise<DashboardKpisView>`; (b) `model/types.ts` exporting `DashboardKpisView` interface with the exact 6 fields returned by backend (`activeKols`, `totalKols`, `totalCanonicalCalls`, `approvedDecisions`, `rejectedDecisions`, `publishedCalls`, all readonly `number`); (c) `model/use-dashboard-kpis.ts` exporting `useDashboardKpis()` using TanStack `useQuery({ queryKey: dashboardKeys.kpis, queryFn: fetchDashboardKpis, refetchInterval: 5_000 })`; (d) `index.ts` barrel exporting `DashboardKpisView`, `dashboardKeys`, `fetchDashboardKpis`, `useDashboardKpis`. Add `ENDPOINTS.dashboard.kpis = '/dashboard/kpis'` entry in `apps/frontend/src/shared/api/endpoints.ts` (new section before `kols`).
  Must NOT do: do not add polling config other than `refetchInterval: 5_000` (matches existing pattern); do not import from `@/widgets/`; do not duplicate types from `shared/realtime/events.ts`.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 1.2
  References:
    - `apps/frontend/src/entities/filter-decision/api/decision-queries.ts` (query keys + fetch pattern)
    - `apps/frontend/src/entities/filter-decision/model/use-decisions.ts` (hook shape, `refetchInterval: 5_000`)
    - `apps/frontend/src/entities/filter-decision/index.ts` (barrel pattern)
    - `apps/frontend/src/shared/api/endpoints.ts:1-78` (ENDPOINTS object — add `dashboard` key)
    - `apps/frontend/src/shared/api/http-client.ts:14-21` (`httpGet<T>` shape)
    - `apps/backend/src/dashboard/application/ports/dashboard-kpis.port.ts:7-14` (response shape to mirror)
  Acceptance criteria: (i) `npm run build` exits 0; (ii) `grep -rn "dashboardKeys" apps/frontend/src/entities/dashboard/` returns ≥3 hits (definition + 2 usages); (iii) TypeScript type `DashboardKpisView` has exactly 6 readonly number fields.
  QA scenarios:
    - Happy: start backend `npm run dev:backend`, then `node -e "fetch('http://localhost:3030/dashboard/kpis').then(r=>r.json()).then(console.log)"` returns the 6 fields. Evidence: `.omo/evidence/task-1.1-dashboard-realtime-kpis.smoke.md`
    - Failure: backend down → `fetchDashboardKpis` throws `HttpError(500)`; `useDashboardKpis` returns `{ isError: true, error }`. No unhandled rejection in console.
  Commit: Y | feat(frontend): add dashboard KPI entity (api + model + types + index)

- [ ] 2. Refactor `KpiCards` to consume `useDashboardKpis` (4 fetches → 1)
  What to do: Rewrite `apps/frontend/src/widgets/kpi-cards/ui/kpi-cards.tsx`. Remove imports of `useKols`, `useRecentCanonical`, `useRecentDecisions`, `usePublished`, and `FilterDecisionView`. Add import of `useDashboardKpis` and `DashboardKpisView` from `@/entities/dashboard`. Replace the 4 `useQuery` hook calls with one `const kpis = useDashboardKpis()`. Replace the in-component arithmetic (`activeKols = kols.data?.filter(...).length`, `approvalRate = approved/(approved+rejected)`, etc.) with direct reads from `kpis.data` (`kpis.data?.activeKols`, etc.). Compute `approvalRate` and `totalDecisions` locally from `approvedDecisions + rejectedDecisions`. Render the same 4 cards with the same labels and tones.
  Must NOT do: do not change card layout, colors, labels, or copy; do not remove the `KpiCard` sub-component; do not introduce new dependencies; do not change the tone logic (`green` if `approvalRate > 0.1` else `orange`).
  Parallelization: Wave 1 | Blocked by: 1.1 | Blocks: 1.3
  References:
    - `apps/frontend/src/widgets/kpi-cards/ui/kpi-cards.tsx:1-82` (current file — full rewrite)
    - `apps/frontend/src/widgets/kpi-cards/index.ts` (re-export unchanged)
  Acceptance criteria: (i) file is ≤60 LOC (was 82; the 4-card body + the `KpiCard` sub-component is irreducible below ~55 LOC); (ii) `grep -n "useKols\|useRecentCanonical\|useRecentDecisions\|usePublished" apps/frontend/src/widgets/kpi-cards/ui/kpi-cards.tsx` returns no hits; (iii) `npm run build` exits 0; (iv) `npm run lint` exits 0.
  QA scenarios:
    - Happy: use Playwright MCP (`skill: playwright`) to navigate to `http://localhost:5173/` and assert the 4 cards render with non-zero numbers; OR run `curl http://localhost:3030/dashboard/kpis | jq` after starting `npm run dev:backend` to confirm the endpoint returns all 6 fields. The Network-tab observation of "1 req/5s" is best-effort (use Playwright's `browser_evaluate` to read `performance.getEntriesByType('resource')` if needed).
    - Failure: `kpis.isError` true → render `—` in each card value (no crash, no skeleton spec yet per scope).
  Commit: Y | feat(frontend): consume /dashboard/kpis in KpiCards (4 fetches → 1)

- [ ] 3. Verify build + manual smoke (Wave 1 gate)
  What to do: Run the full verification suite from the project root: `npm run build` (must exit 0), `npm run lint` (must exit 0), `npm run test:backend` (must exit 0 — catches backend regressions from accidental cross-import). Then start the dev environment with `npm run dev` (concurrently runs backend + frontend). Use the agent's Playwright MCP browser capability (`skill: playwright`) OR `curl http://localhost:3030/dashboard/kpis | jq` to verify: (a) the backend returns all 6 KPI fields with non-zero `publishedCalls` after ≥1 publishing cycle; (b) using the browser DevTools Network tab scoped to the dashboard route, observe exactly 1 request to `/api/dashboard/kpis` per 5s (proxied via Vite to `localhost:3030/dashboard/kpis`); (c) zero requests to `/vip-calls/calls/published` originating from the KpiCards widget (the wrong URL is no longer reached — note: the wrong URL is NOT fixed in `endpoints.ts` in this plan; it's left as a foot-gun for other consumers, to be addressed in a separate task).
  Must NOT do: do not skip any of the three commands; do not modify code in this todo — it's verification only.
  Parallelization: Wave 1 | Blocked by: 1.2 | Blocks: 2.x
  References: `apps/backend/README.md` (dev commands); `apps/frontend/README.md` (dev commands)
  Acceptance criteria: (i) `npm run build` exit 0; (ii) `npm run lint` exit 0; (iii) `npm run test:backend` exit 0; (iv) Network panel shows 1 req/5s to `/dashboard/kpis`; (v) `Published` card displays the real published count (non-zero after 1+ publishing cycle).
  QA scenarios:
    - Happy: all checks green, page loads, KPIs visible.
    - Failure: any command exits non-zero → block Wave 2, report exact failing command and last 20 lines of output.
  Commit: N (verification only)

### Wave 2 — Phase 1 (in-memory TTL cache)

- [ ] 4. Define `DashboardKpisCachePort` + implement `InMemoryDashboardKpisCacheRepository` (TDD)
  What to do (TDD): Write the spec FIRST at `apps/backend/src/dashboard/infrastructure/repositories/__tests__/in-memory-dashboard-kpis-cache.repository.spec.ts` (co-located with the implementation, matching the chain-detection pattern: `in-memory-chain-detection.repository.spec.ts`). The spec tests cover: (a) `get()` on empty returns `null`; (b) `set(kpis, 5000)` then `get()` returns `{ kpis, computedAt }`; (c) advance fake timers by `5001ms` then `get()` returns `null`; (d) `invalidate()` after `set()` makes `get()` return `null`; (e) `set(kpisA, 1000)` then `set(kpisB, 1000)` → `get()` returns `kpisB`. Then implement:
    1. `apps/backend/src/dashboard/application/ports/dashboard-kpis-cache.port.ts` — abstract class with 3 methods: `abstract get(): Promise<{ kpis: DashboardKpis; computedAt: number } | null>`, `abstract set(kpis: DashboardKpis, ttlMs: number): Promise<void>`, `abstract invalidate(): Promise<void>`. Export a `DASHBOARD_CACHE_TTL_MS = 1000` constant from this same file.
    2. `apps/backend/src/dashboard/infrastructure/repositories/in-memory-dashboard-kpis-cache.repository.ts` — concrete class extending the port. Single private field `private cache: { kpis: DashboardKpis; computedAt: number; expiresAt: number } | null = null`. `get()` returns `null` if `cache === null` OR `Date.now() > cache.expiresAt`; else returns `{ kpis: cache.kpis, computedAt: cache.computedAt }`. `set()` writes the 3-field tuple. `invalidate()` sets `cache = null`. No LRU (single entry).
  Must NOT do: do not use `Map<string, _>` (single entry, no key needed); do not introduce LRU eviction; do not import from `shared/cache/*`; do not add Redis support; do not change the `DashboardKpis` interface shape.
  Parallelization: Wave 2 | Blocked by: 1.3 | Blocks: 2.2
  References:
    - `apps/backend/src/chain/detection/infrastructure/repositories/in-memory-chain-detection.repository.ts:6-36` (in-memory pattern, MAX_ENTRIES, Map shape — ignore the LRU; just the class shape)
    - `apps/backend/src/token/milestone/application/ports/milestone-cache.port.ts` (port abstract class pattern)
    - `apps/backend/src/dashboard/application/ports/dashboard-kpis.port.ts:7-14` (`DashboardKpis` interface — reuse as-is)
  Acceptance criteria: (i) `npm run test:backend -- --testPathPattern=dashboard-kpis-cache` exit 0 with ≥5 test cases passing; (ii) `grep -rn "DASHBOARD_CACHE_TTL_MS" apps/backend/src/dashboard/` returns ≥2 hits (definition + usage in 2.2); (iii) `DashboardKpisCachePort` is abstract (TS error if instantiated directly).
  QA scenarios:
    - Happy: spec passes all 5 cases.
    - Failure: `set()` then `get()` returns the cached value; manual `setTimeout(1100)` then `get()` returns `null`.
  Commit: N (rolled into 2.2)

- [ ] 5. Wire cache into `GetDashboardKpisUseCase` + extend spec (TDD via spec additions)
  What to do (TDD): Extend `apps/backend/src/dashboard/application/handlers/get-dashboard-kpis.use-case.spec.ts` with 4 new test cases BEFORE touching the use case: (i) cache hit — fake cache returns `{ kpis, computedAt }`, `execute()` returns kpis and the 4 repos are NOT called; (ii) cache miss (null) — fake cache returns `null`, the 4 repos are called, `cache.set(result, DASHBOARD_CACHE_TTL_MS)` is called; (iii) cache invalidation flow — second call within TTL reuses cache (no re-call to repos); (iv) cache TTL is exactly `DASHBOARD_CACHE_TTL_MS` (assertion on the second arg to `set`). Then modify `apps/backend/src/dashboard/application/handlers/get-dashboard-kpis.use-case.ts`: (a) import the port; (b) inject it in the constructor (5th param, after the 4 existing repos); (c) in `execute()`, first call `this.cache.get()`; if non-null, return the cached `kpis`; else run the existing `Promise.all` block, then `await this.cache.set(result, DASHBOARD_CACHE_TTL_MS)`, then return.
  Must NOT do: do not change the return type of `execute()`; do not introduce a `Date.now()`-based check inside `execute()` (the cache owns expiry); do not remove the existing test cases — but DO modify the 2-call test at `:134-151` to reflect cache behavior: either (a) rename to "cache hit" and assert `countCalls === 1` after two back-to-back calls, or (b) insert `jest.advanceTimersByTime(1100)` between calls to force expiry and assert `countCalls === 2`; do not modify any other file in the use case; do not change the order of the 4 existing repo injections (the cache becomes the 5th constructor param).
  Parallelization: Wave 2 | Blocked by: 2.1 | Blocks: 3.x
  References:
    - `apps/backend/src/dashboard/application/handlers/get-dashboard-kpis.use-case.ts:1-47` (current body — full understanding)
    - `apps/backend/src/dashboard/application/handlers/get-dashboard-kpis.use-case.spec.ts:1-152` (current spec; FakeKolRepo etc. are extended)
  Acceptance criteria: (i) all 4 new test cases pass + the 2 existing cases still pass; (ii) `npm run test:backend -- --testPathPattern=get-dashboard-kpis` exit 0; (iii) `npm run test:backend` exit 0 (no other BC breaks); (iv) `npm run build` exit 0.
  QA scenarios:
    - Happy: spec passes; `npm run dev:backend` + curl `curl http://localhost:3030/dashboard/kpis | jq` returns the 6 fields twice in a row; first call hits the 4 repos, second call (within 1s) returns cached (visible by adding a debug log in the repo fake if needed).
    - Failure: cache adapter throws → `execute()` propagates the error → controller's NestJS default error handler returns 500 (acceptable; no fallback needed).
  Commit: Y | feat(dashboard): in-memory 1s TTL cache for KPIs

### Wave 3 — Phase 2 (WebSocket push + reconnect snapshot)

- [ ] 6. Define `KpisUpdatedEvent` + `KpisUpdatedEventPublisher` port + `InProcessKpisUpdatedEventPublisher` (TDD)
  What to do (TDD): Write the spec FIRST in `apps/backend/src/dashboard/infrastructure/messaging/__tests__/in-process-kpis-updated-event.publisher.spec.ts`. Tests: (i) `publish(KpisUpdatedEvent)` → `eventEmitter.emit('dashboard.kpis.updated', event)` is called with the same event instance; (ii) `publishAll([e1, e2])` → `emit` called twice with each event. Then implement:
    1. `apps/backend/src/dashboard/domain/events/kpis-updated.event.ts` — class extending `DomainEvent`. `eventName = 'dashboard.kpis.updated'`. Constructor takes a payload of the 6 KPI numbers + `updatedAt: Date`. `toPayload()` returns the same shape with `updatedAt: updatedAt.toISOString()`.
    2. `apps/backend/src/dashboard/application/ports/kpis-updated-event.publisher.ts` — abstract class with `abstract publish(event: KpisUpdatedEvent): Promise<void>` and `abstract publishAll(events: ReadonlyArray<KpisUpdatedEvent>): Promise<void>`.
    3. `apps/backend/src/dashboard/infrastructure/messaging/in-process-kpis-updated-event.publisher.ts` — concrete class injecting `EventEmitter2`. Mirror the shape of `in-process-chain-detection-event.publisher.ts`. `publish` calls `this.eventEmitter.emit(event.eventName, event)` with a debug log. `publishAll` iterates and calls `publish` for each.
  Must NOT do: do not publish on `EventEmitter2.wildcard` (keep eventName explicit); do not introduce a new event bus library; do not freeze the payload via `Object.freeze` in this iteration (the `DomainEvent` base does not require it; keep simple).
  Parallelization: Wave 3 | Blocked by: 2.2 | Blocks: 3.2, 3.3
  References:
    - `apps/backend/src/chain/detection/infrastructure/messaging/in-process-chain-detection-event.publisher.ts` (mirror pattern)
    - `apps/backend/src/chain/detection/domain/events/chain-detected.event.ts:7-53` (DomainEvent subclass pattern, `eventName`, `toPayload`)
    - `apps/backend/src/shared/kernel/domain-event.ts:13` (DomainEvent base class)
    - `apps/backend/src/dashboard/application/ports/dashboard-kpis.port.ts:7-14` (KPI field names)
  Acceptance criteria: (i) spec passes both cases; (ii) `npm run test:backend -- --testPathPattern=kpis-updated-event` exit 0; (iii) `KpisUpdatedEvent` extends `DomainEvent`; (iv) `eventName` static accessor returns `'dashboard.kpis.updated'`.
  QA scenarios:
    - Happy: `publish(e)` → underlying `eventEmitter.emit` called with `'dashboard.kpis.updated'` key.
    - Failure: cast `null` to bypass TS: `publisher.publish(null as unknown as KpisUpdatedEvent)` does NOT crash silently — it either throws a clear error or no-ops with a log (whichever the impl chooses, but it must be observable in the test).
  Commit: N (rolled into 3.3 — backend event infra stays as one logical commit)

- [ ] 7. Define `RefreshKpisService` (orchestrator: invalidate cache → recompute → emit) — TDD
  What to do (TDD): Write the spec FIRST in `apps/backend/src/dashboard/application/services/__tests__/refresh-kpis.service.spec.ts`. Tests: (i) `refresh()` calls `cache.invalidate()` then `getDashboardKpisUseCase.execute()` then publishes exactly one `KpisUpdatedEvent` with the recomputed kpis and a fresh `updatedAt`; (ii) `refresh()` is async — returns a Promise that resolves after all 3 steps; (iii) `getDashboardKpisUseCase.execute()` throws → `cache.invalidate()` is called BEFORE the throw (so the next call recomputes); `publish` is NOT called (error path skips publish). Then implement `apps/backend/src/dashboard/application/services/refresh-kpis.service.ts`:
    ```ts
    @Injectable()
    export class RefreshKpisService {
      constructor(
        private readonly cache: DashboardKpisCachePort,
        private readonly getKpis: GetDashboardKpisUseCase,
        private readonly publisher: KpisUpdatedEventPublisher,
      ) {}
      async refresh(): Promise<void> {
        await this.cache.invalidate();
        const kpis = await this.getKpis.execute();
        const event = new KpisUpdatedEvent({ ...kpis, updatedAt: new Date() });
        await this.publisher.publish(event);
      }
    }
    ```
  Must NOT do: do not introduce a `RefreshKpisHandler` (this is a service, not a handler — handlers live in `infrastructure/event-bus/`); do not cache the result of `refresh()` in the service itself (delegated to `GetDashboardKpisUseCase`); do not swallow errors silently (let them propagate to the handler which will try/catch them).
  Parallelization: Wave 3 | Blocked by: 3.1, 3.2 (publisher port+adapter), 2.4 (Wave 2 gate — cache layer complete) | Blocks: 3.3
  References:
    - `apps/backend/src/dashboard/application/handlers/get-dashboard-kpis.use-case.ts` (for the `execute` contract)
    - `apps/backend/src/dashboard/application/services/` (directory does not exist yet — `mkdir -p` it)
2. Acceptance criteria: (i) all 3 spec cases pass; (ii) `npm run test:backend -- --testPathPattern=refresh-kpis` exit 0; (iii) `RefreshKpisService.refresh()` is idempotent (call twice in a row → both succeed, second recomputes because cache was invalidated).
  QA scenarios:
    - Happy: `refresh()` recomputes + emits.
    - Failure: underlying use case throws → service propagates; caller handler catches + logs.
  Commit: N (rolled into 3.3)

- [ ] 8. Add 4 `@OnEvent` handlers + wire `dashboard.module.ts` (TDD per handler)
  What to do (TDD): Write the spec FIRST in `apps/backend/src/dashboard/infrastructure/event-bus/__tests__/` (one spec file per handler; each is tiny):
    - `normalization.handler.spec.ts`: on `normalization.call.normalized`, calls `refreshKpis.refresh()`. Swallows errors (try/catch) and logs warn.
    - `filters-approved.handler.spec.ts`: on `filters.token.approved`, same.
    - `filters-rejected.handler.spec.ts`: on `filters.token.rejected`, same.
    - `publishing-published.handler.spec.ts`: on `publishing.telegram.published`, same.
  Each spec: (i) handler invokes `refresh.refresh()` exactly once per `@OnEvent` callback; (ii) if `refresh.refresh()` throws, the handler does NOT throw (logs warn).
  Then implement each handler:
    ```ts
    @Injectable()
    export class NormalizationHandler {
      private readonly logger = new Logger(NormalizationHandler.name);
      constructor(private readonly refresh: RefreshKpisService) {}
      @OnEvent('normalization.call.normalized', { async: true })
      async handle(_event: NormalizationCallNormalizedEvent): Promise<void> {
        try { await this.refresh.refresh(); }
        catch (e) { this.logger.warn(`refresh failed: ${(e as Error).message}`); }
      }
    }
    ```
  Repeat for the other 3 handlers with the matching event name and a matching domain event type (import the respective event class for type safety; if not exported, use `DomainEvent` from `shared/kernel/domain-event`).
  Then modify `apps/backend/src/dashboard/dashboard.module.ts`:
    - Add `RefreshKpisService` to `providers`.
    - Add `KpisUpdatedEventPublisher` provider using `useClass: InProcessKpisUpdatedEventPublisher` (single impl, no factory needed).
    - Add the 4 handlers to `providers`.
    - Add `InMemoryDashboardKpisCacheRepository` provider (`useClass`, no factory) and bind it to `DashboardKpisCachePort` via `useClass` (or simple injection in the use case constructor — no token indirection needed for single impl).
    - `EventEmitterModule.forRoot({ global: true })` is already loaded in `AppModule` — no need to re-import.
  Must NOT do: do not change `app.module.ts` (no new module to import); do not add `EventEmitter2` as a constructor param to handlers (NestJS `@OnEvent` decorator handles wiring); do not use sync mode in `@OnEvent` (keep `async: true` so a slow refresh doesn't block other handlers); do not introduce retries.
  Parallelization: Wave 3 | Blocked by: 3.2 | Blocks: 3.7, 3.8
  References:
    - `apps/backend/src/chain/detection/infrastructure/event-bus/call-normalized.handler.ts:15-36` (exact pattern reference)
    - `apps/backend/src/token/scoring/infrastructure/event-bus/token-classified.handler.ts` (another handler pattern)
    - `apps/backend/src/chain/detection/chain-detection.module.ts:62-64` (factory provider pattern — reference for HOW providers bind to tokens; dashboard uses simpler `useClass` since there is only one impl)
    - `apps/backend/src/app.module.ts:39-44` (EventEmitterModule global)
    - `apps/backend/src/dashboard/dashboard.module.ts:1-26` (current module)
  Acceptance criteria: (i) all 4 handler specs pass; (ii) `npm run test:backend -- --testPathPattern=dashboard/infrastructure` exit 0; (iii) `dashboard.module.ts` compiles; (iv) full `npm run test:backend` exit 0.
  QA scenarios:
    - Happy: start dev backend; trigger an event via the existing HTTP endpoints (e.g. `POST /token/normalization/tokens/:chain/:address/reprocess` or similar) — handler recomputes + emits `dashboard.kpis.updated`.
    - Failure: `refresh.refresh()` throws → log warn appears, no crash, next event still handled.
  Commit: Y | feat(dashboard): subscribe to pipeline events + emit KpisUpdatedEvent

- [ ] 9. Add `dashboard.kpis.updated` to `WsGateway.EVENT_MAP` + implement real `missedSince` (TDD via spec)
  What to do (TDD): Write the spec FIRST in `apps/backend/src/shared/ws/gateway/__tests__/ws.gateway.spec.ts`. Tests:
    - (i) When `EventEmitter2.emit('dashboard.kpis.updated', event)` fires, `gateway.server.emit('dashboard.kpis.updated', payload)` is called (1:1 passthrough).
    - (ii) When `EventEmitter2.emit('filters.token.approved', event)` fires (any event), `gateway.handleConnection(client)` followed by reading the emitted `hello` payload → `missedSince` equals `new Date(<lastEventTimestamp>).toISOString()`.
    - (iii) When NO events have fired yet, `handleConnection` emits `hello` with `missedSince: null`.
  Then modify `apps/backend/src/shared/ws/gateway/ws.gateway.ts`:
    1. Add to `EVENT_MAP` (line 45-57): `'dashboard.kpis.updated': 'dashboard.kpis.updated',`
    2. Add a private field `private lastEventTimestamp: number = 0;`
    3. In `handlePipelineEvent` (line 101-115), at the top, set `this.lastEventTimestamp = Date.now();`
    4. In `handleConnection` (line 75-83), modify the `hello` payload: `missedSince: this.lastEventTimestamp > 0 ? new Date(this.lastEventTimestamp).toISOString() : null`. Keep `bufferedCount: 0` (buffering is out of scope per draft).
  Must NOT do: do not change the CORS config; do not add `bufferedCount > 0` logic (documented as out of scope); do not introduce per-event-type filtering for `missedSince` (any forwarded event resets the timer); do not change the `hello` shape beyond `missedSince`; do not change the existing 11 EVENT_MAP entries.
  Parallelization: Wave 3 | Blocked by: 3.3 (logical) | Blocks: 3.5, 3.6
  References:
    - `apps/backend/src/shared/ws/gateway/ws.gateway.ts:45-57` (EVENT_MAP to extend)
    - `apps/backend/src/shared/ws/gateway/ws.gateway.ts:75-83` (current `hello`)
    - `apps/backend/src/shared/ws/gateway/ws.gateway.ts:101-115` (handlePipelineEvent)
    - `apps/frontend/src/shared/realtime/events.ts:117-121` (`ServerHello` type — `missedSince: string | null` already declared)
  Acceptance criteria: (i) all 3 spec cases pass; (ii) `npm run test:backend -- --testPathPattern=ws.gateway` exit 0; (iii) `EVENT_MAP` has 12 entries (was 11); (iv) `missedSince` is non-null in the `hello` payload AFTER `EventEmitter2.emit('any.event.name', ...)` is called and BEFORE `handleConnection` (asserted via a fake Socket `client.emit` mock capturing the hello payload).
  QA scenarios:
    - Happy: write a Playwright MCP integration test (or use `socket.io-client` directly in a Node script): connect to `ws://localhost:3030`, await the `hello` event, fire a backend event (e.g., `curl -X POST http://localhost:3030/token/token-gating/apply` with valid input), reconnect the socket, await the new `hello` event, assert `payload.missedSince` is a non-null ISO string matching `> Date.now() - 60_000`. The WsGateway spec already covers the unit-level behavior (assertion (iv) in todo 9's acceptance criteria); this QA is for end-to-end.
    - Failure: zero events fired → `missedSince: null` (existing behavior, unchanged).
  Commit: Y | feat(ws): map dashboard.kpis.updated + real missedSince on reconnect

- [ ] 10. Frontend: extend `WS_EVENTS` + refactor `useDashboardKpis` to subscribe via `useEventStream` + 30s backstop
  What to do (no TDD — frontend has no test infra today):
    1. `apps/frontend/src/shared/realtime/events.ts`: add `DashboardKpisUpdated: 'dashboard.kpis.updated',` to `WS_EVENTS` (after `AnalyticsCompleted`). Export a new interface `DashboardKpisUpdatedEvent` mirroring the backend payload (`activeKols`, `totalKols`, `totalCanonicalCalls`, `approvedDecisions`, `rejectedDecisions`, `publishedCalls`, `updatedAt: string`).
    2. `apps/frontend/src/entities/dashboard/model/use-dashboard-kpis.ts`: rewrite. Get `queryClient` from `useQueryClient()`. The `useQuery` config changes: add `refetchInterval: 30_000` (was 5_000; backstop becomes less frequent because WS push dominates). Add a second hook: `useDashboardKpisSubscription()` — a separate file? No, keep in same file as `useDashboardKpis`; export both. The subscription hook uses `useEventStream<DashboardKpisUpdatedEvent>('dashboard.kpis.updated', useCallback((payload) => queryClient.setQueryData(dashboardKeys.kpis, payload), [queryClient]))`.
    3. `apps/frontend/src/widgets/kpi-cards/ui/kpi-cards.tsx`: import `useDashboardKpisSubscription` and call it once (no return value used).
  Must NOT do: do not remove the `refetchInterval` (backstop must stay); do not introduce `vitest` or any new test framework (out of scope); do not change the polling interval below 30s without explicit user approval; do not rename `dashboardKeys.kpis` (keep stable).
  Parallelization: Wave 3 | Blocked by: 1.1 (hook refactor); 3.5 (EVENT_MAP entry) | Blocks: 3.6
  References:
    - `apps/frontend/src/shared/realtime/use-event-stream.ts:5-19` (hook to use)
    - `apps/frontend/src/shared/realtime/events.ts:123-136` (`WS_EVENTS` to extend)
    - `apps/frontend/src/entities/dashboard/model/use-dashboard-kpis.ts` (file created in 1.1)
    - `apps/frontend/src/widgets/kpi-cards/ui/kpi-cards.tsx` (file refactored in 1.2)
  Acceptance criteria: (i) `npm run build` exit 0; (ii) `npm run lint` exit 0; (iii) `WS_EVENTS` has 13 entries (was 12); (iv) `useDashboardKpisSubscription` is exported; (v) `KpiCards.tsx` calls it (verify via grep).
  QA scenarios:
    - Happy: `npm run dev:backend` + `npm run dev:frontend`; trigger a `filters.token.approved` event (via the existing `POST /token/token-gating/apply` HTTP endpoint or by feeding a synthetic message); KpiCards `Approval rate` updates within ~50-200ms without polling.
    - Failure: WS disconnects → `useEventStream` re-subscribes via socket.io's reconnection; polling backstop fills the gap.
  Commit: Y | feat(frontend): subscribe to dashboard.kpis.updated via WebSocket

- [ ] 11. Wire `dashboard.module.ts` + final smoke (Wave 3 gate)
  What to do: Final verification. Run from project root: `npm run build` (exit 0), `npm run lint` (exit 0), `npm run test:backend` (exit 0). Then start dev env, open dashboard, observe: (a) initial HTTP `/dashboard/kpis` fetches once; (b) on any pipeline event (try `POST /token/token-gating/apply` with a known input), the dashboard updates without a new HTTP request; (c) kill the backend → frontend shows error state or stale data → restart backend → frontend recovers within `reconnectionDelay` (configured to 1000ms in `socket.ts:16`). Save Network+WS traces to evidence.
  Must NOT do: do not modify code in this todo — it's the gate.
  Parallelization: Wave 3 | Blocked by: 3.5 | Blocks: Final verification wave
  References: all Wave 3 file paths
  Acceptance criteria: (i) all three commands exit 0; (ii) manual smoke confirms a-d above; (iii) `Published` card updates in <1s after a `publishing.telegram.published` event.
  QA scenarios:
    - Happy: all green.
    - Failure: any failing assertion → revert to last good commit and re-open issue; do NOT delete failing tests to "pass" them.
  Commit: N (verification only)

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit — agent confirms every Must-have in `## Scope` is delivered with file:line evidence; every Must-NOT-have is verified absent.
- [ ] F2. Code quality review — agent reviews changed files for: type safety (no `any`, no `@ts-ignore`), consistent patterns (matches neighbouring BCs), no dead code, no commented-out blocks, no debug `console.log` left in.
- [ ] F3. Real manual QA — agent runs `npm run dev`, opens the dashboard, captures a 60-second video/screenshot proving: (a) Published count non-zero after 1+ publishing cycle; (b) KPI updates on a synthetic pipeline event WITHOUT a new HTTP fetch; (c) WS reconnect populates `missedSince` in the `hello` payload.
- [ ] F4. Scope fidelity — agent greps for the explicit anti-patterns from Must-NOT-have: confirms no `KolLifecycleChangedEvent`, no Redis import in dashboard module, no change to `app.module.ts`, no new `EVENT_MAP` removals, no `vitest` in `apps/frontend/package.json`.

## Commit strategy

Three atomic commits, one per phase. Each commit leaves the codebase in a working state (no broken mid-phase commits).

| Commit | When | Files | Message |
|---|---|---|---|
| 1 | After todos 1-3 (Wave 1) | 4 new frontend files + 1 modified KpiCards + 1 modified endpoints.ts | `feat(frontend): wire dashboard /kpis (4 fetches → 1)` |
| 2 | After todos 4-5 (Wave 2) | 2 new backend files (port + adapter) + 1 modified use case + 1 extended spec | `feat(dashboard): in-memory 1s TTL cache for KPIs` |
| 3a | After todos 6-9 (Wave 3, backend portion) | 5 new backend files (event, publisher port, publisher impl, service, gateway spec) + 1 modified WsGateway + 1 modified dashboard.module.ts + 4 new event-bus handlers | `feat(dashboard): push KPI updates via WebSocket` (squashes 3.1-3.4 per sub-section) |
| 3b | After todos 10-11 (Wave 3, frontend portion + gate) | 1 modified shared/realtime/events.ts + 1 modified use-dashboard-kpis.ts + 1 modified KpiCards.tsx | `feat(frontend): subscribe to dashboard.kpis.updated via WebSocket` |

**Notes**:
- 3a MUST land before 3b. The frontend (3b) imports `WS_EVENTS.DashboardKpisUpdated` and the gateway (`WsGateway.EVENT_MAP`) entry — neither exists until 3a lands. If 3b were to ship first, the build would fail with `Property 'DashboardKpisUpdated' does not exist on type ...`.
- No merge commits; no fixup commits; if a build breaks mid-phase, the executor REVERTS that phase's changes rather than committing a broken state.
- Branch strategy: executor creates branch `feat/dashboard-realtime-kpis` from `main` and opens 1 PR with the 4 commits at the end. If the user prefers commit-per-Wave, the executor can squash 3a+3b into one before merge.

## Success criteria

All four must be true for the plan to be considered complete:

1. **Behavioral**: With backend running, opening `http://localhost:5173/` shows the dashboard with non-zero `Published` count after ≥1 publishing cycle. A `filters.token.approved` event updates the `Approval rate` card within 200ms WITHOUT triggering a new HTTP request to `/dashboard/kpis` (verified via Playwright MCP reading `performance.getEntriesByType('resource')` filtered by `/dashboard/kpis`).
2. **Performance**: Under `npm run test:backend`, the `get-dashboard-kpis.use-case.spec.ts` test suite passes with the new cache scenarios; two consecutive `execute()` calls within 1s show exactly 1 set of repo calls (asserted in spec).
3. **Reconnect**: Killing and restarting the backend mid-session causes the frontend's `useDashboardKpis` to recover (initial HTTP fetch + resumed WS subscription) without a page refresh. The `hello` payload contains a non-null `missedSince` once any pipeline event has fired.
4. **Hygiene**: `npm run build`, `npm run lint`, and `npm run test:backend` all exit 0. No `as any`, no `@ts-ignore`, no commented-out code, no `console.log` left in changed files. `apps/frontend/package.json` has zero new dependencies. `apps/backend/src/app.module.ts` is unchanged from `main`.

If any of the four fails, the plan is NOT complete — fix the failing criterion and re-run the F1-F4 final verification wave.
