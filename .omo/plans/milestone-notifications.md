# Milestone Notifications for VIP Calls Channel (Agnostic Core)

## TL;DR

> **Quick Summary**: Build a new `token/milestone` BC that detects when published token calls cross configurable multiples (default 2x, 3x, …, 100x) and emits domain events. Add a Telegram-agnostic event consumer in `telegram/vip-calls-channel` that formats + sends the message. Add Redis infra + a live cron that reads current MC from DexScreener every 5 min and compares against the snapshot's MC at publish time.
>
> **Deliverables**:
> - New `token/milestone` BC (domain, app, infra, scheduling) — fully Telegram-agnostic
> - `milestone_thresholds`, `monitored_calls`, `notified_milestones` tables (Postgres + in-memory fallback)
> - Redis infra (ioredis, shared module, docker-compose entry)
> - LiveMilestoneScheduler cron (every 5 min, configurable)
> - Extension of `PublishedCall` to persist `mcAtCall`
> - `CallMilestoneReachedEvent` + `RegisterCallForMilestonesEvent` domain events
> - vip-calls-channel consumer (`@OnEvent` handler + formatter method)
> - Full TDD test suite (unit tests + agent-executed QA scenarios)
>
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES — 4 waves (max 7 tasks per wave)
> **Critical Path**: W1.T1 (Redis infra) → W1.T3 (entities) → W2.T6 (TypeORM persistence) → W3.T14 (EvaluateActiveCalls) → W4.T17 (Scheduler) → W4.T18 (Module wiring) → F1-F4

---

## Context

### Original Request

User wants milestone notifications in `apps/backend/src/telegram/vip-calls-channel` that announce when a published VIP call crosses multiples (starting from 2x, every 1x up to 100x). The price baseline is the market cap from the snapshot at publish time. Thresholds must be configurable via DB + settings. Reuse existing cron if possible (none fit, so a new one is needed). Need Redis and any other necessary infrastructure.

**Agnostic constraint (reinforced twice by user)**: `token/milestone` must be **completely agnostic** — usable in the future by any other Telegram bot in `src/telegram`. No Telegram imports, no publishers, no formatters in the milestone BC.

### Interview Summary

**Key Discussions**:
- **Architecture**: New BC `token/milestone` as core + `vip-calls-channel` as consumer via `@OnEvent`. Future consumers (other telegram bots) plug in by adding another `@OnEvent` handler.
- **Thresholds**: Default `[2, 3, …, 100]` literal (99 values). Configurable via dedicated `MilestoneThresholdEntity` (cleaner than reusing `SettingsFilterEntity` for a list of numbers).
- **Attribution**: NO KOL mention in milestone messages. Metrics only.
- **Channel**: Reuse existing `vip-calls-channel` botToken + outputChannel from `publishing.vipCalls.*` config.
- **Dedup state**: Postgres (`notified_milestones` table, source of truth) + Redis (cache for fast lookup, TTL 30 days).
- **Cron**: New cron in milestone BC (existing `BackgroundEvaluationScheduler` is one-shot per horizon, not reusable for live tracking).
- **Baseline MC**: Add `mcAtCall: number | null` to `PublishedCall` entity. Populated from publish input (`marketCapUsd`). Existing PublishedCall records without `mcAtCall` are simply not monitored (backwards compatible).
- **Tests**: TDD — tests first, then implementation.

**Research Findings**:
- `BackgroundEvaluationScheduler` exists at `apps/backend/src/token/call-tracking/infrastructure/scheduling/background-evaluation.scheduler.ts:51` — runs every 5 min but processes **scheduled jobs** (one-shot per `(call, horizon)`), not live tracking. NOT reusable.
- `DexscreenerCallOutcomeEvaluatorAdapter.evaluateCall()` at `apps/backend/src/token/call-tracking/infrastructure/adapters/dexscreener-call-outcome-evaluator.adapter.ts:48` returns `{mcNow, athMultiple, mcAtCall}` — REUSABLE for live MC. The athMultiple computation is simplified (`callPrice=1.0`) but `mcNow` is reliable. For batching, we need to add a batch endpoint call (DexScreener supports `/tokens/{addr1},{addr2},…`).
- `TokenSnapshot` at `apps/backend/src/chain/explorer/domain/entities/token-snapshot.entity.ts:77` has idempotent storage — `marketCapUsd` is the **latest refreshed**, NOT the MC at call time. Snapshot OVERWRITES on refresh, so it cannot serve as a baseline for previously-published calls. We must capture MC at publish time separately.
- `PublishedCall` at `apps/backend/src/telegram/shared/domain/entities/published-call.entity.ts:35` has NO `mcAtCall` field. The publish use case receives `marketCapUsd` but discards it.
- No Redis anywhere. Confirmed via grep on `apps/backend/package.json` (no match), `apps/backend/docker-compose.yml` (only postgres+pgadmin), and full `src` tree. Need full infra addition.
- `SettingsFilterEntity` exists at `apps/backend/src/settings/infrastructure/persistence/typeorm/entities/settings-filter.entity.ts` — extensible by `type` discriminator. For thresholds (a list of numbers), a dedicated entity is cleaner than overloading the generic filter.
- No existing `@OnEvent('milestone.*')` handler — clean slate for the event names.
- `VipCallsBotApiPublisherAdapter` at `apps/backend/src/telegram/vip-calls-channel/infrastructure/senders/bot-api-telegram-publisher.adapter.ts:20` is the existing Telegram Bot API sender — reused as-is by the consumer handler.

### Metis Review (self-conducted)

**Identified Gaps** (addressed in plan):
- **Cron concurrency**: Add running-flag guard to prevent overlap if tick > 5 min.
- **Rate limiting**: DexScreener free tier = 300 req/min. Batch of 30 addresses per call avoids hammering.
- **Failure isolation**: Redis down → fallback to DB only (slower but correct). Telegram send fails → logged, milestone still recorded as notified (no infinite retries).
- **Active window cap**: 72h default — stops monitoring after 3 days to bound memory.
- **DexScreener pair mismatch**: Tolerate (use any pair's marketCap, same as existing evaluator).

**Auto-Resolved Defaults**:
- Default thresholds: `[2, 3, 4, …, 100]` literal (99 values).
- Active window: 72h, configurable via `MILESTONE_ACTIVE_WINDOW_HOURS`.
- Batch size: 30 addresses (DexScreener limit).
- Redis TTL: 30 days.
- Stale MC tolerance: ignore ticks where `mcNow ≤ 0` or `mcAtCall ≤ 0`.

---

## Work Objectives

### Core Objective

Build a Telegram-agnostic milestone detection system that fires domain events when published token calls cross configurable multiples (default 2x–100x). One consumer (`vip-calls-channel`) currently subscribes; the design allows any number of future Telegram bots to subscribe.

### Concrete Deliverables

1. New `apps/backend/src/token/milestone/` BC with full hexagonal layering (api, application, domain, infrastructure).
2. Three new Postgres tables: `milestone_thresholds`, `monitored_calls`, `notified_milestones` (with `synchronize: true` auto-migration).
3. In-memory repository implementations (when `DATABASE_ENABLED=false`).
4. New Redis module (`apps/backend/src/shared/common/redis/`) with `ioredis` provider.
5. Updated `apps/backend/docker-compose.yml` with Redis service.
6. Updated `apps/backend/package.json` with `ioredis` dependency.
7. Extended `PublishedCall` entity with `mcAtCall: number | null` field.
8. Updated `VipCallsPublishUseCase` to populate `mcAtCall` from `marketCapUsd` input.
9. New domain events: `CallMilestoneReachedEvent`, `RegisterCallForMilestonesEvent`.
10. New `LiveMilestoneScheduler` running every 5 min (configurable).
11. New `@OnEvent` handler in `telegram/vip-calls-channel` (consumer pattern, fully isolated from milestone BC).
12. Extended `VipCallsMessageFormatterAdapter` with `formatMilestoneMessage()` method.
13. App config additions (`milestone.*` + `redis.*`).
14. AppModule wiring (RedisModule + MilestoneModule).
15. TDD test suite covering all use cases + adapters + handlers + scheduler.
16. Agent-executed QA scenarios (HTTP API, simulated cron tick, end-to-end Telegram send).

### Definition of Done

- [ ] All TDD tests pass: `npm run test:backend -- --testPathPattern="milestone"` (expecting 30+ tests)
- [ ] `npm run build` exits 0 with no TypeScript errors
- [ ] `npm run lint` exits 0
- [ ] Docker compose up + `npm run dev:backend` boots without errors (with Redis healthy)
- [ ] Manual QA: POST `/vip-calls/publish` with `marketCapUsd=10000` → after 1 tick, calling `POST /milestones/admin/tick` (test endpoint) with mocked current MC = 25000 produces a Telegram message in the VIP channel
- [ ] DB schema includes the 3 new tables (`milestone_thresholds`, `monitored_calls`, `notified_milestones`)
- [ ] Default thresholds `[2..100]` populated when DB is empty
- [ ] Redis cache populated on first read; cache hit on subsequent reads
- [ ] Cron runs every 5 min without overlap
- [ ] No Telegram imports in `src/token/milestone/**` (verified by grep)

### Must Have

- Default thresholds `[2, 3, 4, …, 100]` auto-populated when DB is empty
- Live cron every 5 min, configurable via `MILESTONE_SCHEDULER_CRON`
- `mcAtCall` persisted on every new `PublishedCall` (backfill: existing records have `null` and are NOT monitored)
- Dedup across multiple ticks (same threshold never sent twice for the same call)
- Active window cap (default 72h, configurable)
- DexScreener batched fetch (30 addresses per request)
- Redis cache with DB fallback
- TDD: tests written BEFORE implementation for every use case, service, handler, and adapter
- Consumer pattern: zero Telegram imports in `src/token/milestone/**`
- Both events documented in BC README

### Must NOT Have (Guardrails)

- ❌ NO Telegram imports in `src/token/milestone/**` (any file path under that BC)
- ❌ NO message formatters or chat IDs in the milestone BC
- ❌ NO bot tokens or channels in the milestone BC
- ❌ NO frontend UI changes (out of scope)
- ❌ NO KOL attribution in milestone messages (per R8)
- ❌ NO negative milestones (rug detection — separate concern, future work)
- ❌ NO multi-channel fan-out beyond vip-calls (designed for extension, but only one consumer wired now)
- ❌ NO backfill of historical published calls without `mcAtCall`
- ❌ NO `any` types, no `@ts-ignore` in new code
- ❌ NO inline comments explaining obvious code (AI slop guard)
- ❌ NO premature abstraction (no generic "EventBus" wrapper around EventEmitter2)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Jest, 306 existing tests)
- **Automated tests**: **TDD** — tests written before implementation
- **Framework**: Jest (matching existing project)
- **TDD workflow**: RED (failing test) → GREEN (minimal impl) → REFACTOR (clean)

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **HTTP API**: Use `curl` (Bash) — POST/GET endpoints, assert status + JSON fields
- **CLI/cron simulation**: Use `tmux` (interactive_bash) — trigger manual tick, observe logs
- **Telegram end-to-end**: Use `curl` against Telegram Bot API with a test bot token in `.env.test` — verify message sent to test channel
- **DB verification**: Use `psql` via Bash — assert rows in `milestone_thresholds`, `monitored_calls`, `notified_milestones`
- **Redis verification**: Use `redis-cli` via Bash — assert keys with TTL

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — foundation, 7 parallel tasks):
├── T1: Redis infra (ioredis + module + docker-compose + package.json)
├── T2: AppConfig extensions (milestone.* + redis.*)
├── T3: MilestoneThresholdEntity (domain)
├── T4: MonitoredCall entity (domain)
├── T5: NotifiedMilestone entity (domain)
├── T6: MilestoneMultiple VO
└── T7: Domain events (CallMilestoneReachedEvent + RegisterCallForMilestonesEvent)

Wave 2 (After W1 — BC core, 6 parallel tasks):
├── T8:  Application ports (repositories + cache + live MC interfaces)
├── T9:  DetectCrossedMilestonesService (TDD-first pure logic)
├── T10: TypeORM persistence (orm entities + repos + entity registration)
├── T11: In-memory repos (for DATABASE_ENABLED=false)
├── T12: DexScreener live MC adapter (with batch support)
└── T13: Redis cache adapter (read-through pattern)

Wave 3 (After W2 — use cases + module, 5 parallel tasks):
├── T14: RecordNotifiedMilestoneUseCase (persist + emit event)
├── T15: RegisterMonitoredCallUseCase + @OnEvent handler
├── T16: EvaluateActiveCallsUseCase (per-batch orchestration)
├── T17: Settings adapter (read thresholds, fallback defaults)
└── T18: MilestoneModule wiring + default seed service

Wave 4 (After W3 — scheduler + integration + consumer, 5 parallel tasks):
├── T19: LiveMilestoneScheduler (cron every 5 min)
├── T20: Extend PublishedCall + update VipCallsPublishUseCase (mcAtCall)
├── T21: vip-calls-channel consumer handler (@OnEvent + formatter method)
├── T22: HTTP controllers (CRUD thresholds + read APIs + admin tick)
└── T23: AppModule integration + smoke test

Wave FINAL (After ALL — 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright if UI)
└── F4: Scope fidelity check (deep)

Critical Path: T1 → T10 → T14 → T16 → T19 → T23 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 7 (Wave 1)
```

### Dependency Matrix

- T1 (Redis infra): — → T13, T23
- T2 (AppConfig): — → T18, T19, T22
- T3 (ThresholdEntity): T6 → T8, T10, T17
- T4 (MonitoredCall): T6 → T8, T10
- T5 (NotifiedMilestone): T6 → T8, T10
- T6 (MultipleVO): — → T3, T4, T5, T7
- T7 (Events): T6 → T14, T15, T21
- T8 (Ports): T3, T4, T5 → T10, T11, T13, T14, T15, T16
- T9 (DetectService): T3 → T16
- T10 (TypeORM): T3, T4, T5 → T14, T15, T16, T22
- T11 (InMemory): T3, T4, T5 → T18
- T12 (DexScreener): — → T16
- T13 (RedisCache): T1 → T14, T16
- T14 (RecordUseCase): T7, T8, T10, T13 → T16
- T15 (RegisterUseCase): T7, T8, T10 → T20
- T16 (EvaluateUseCase): T9, T12, T14 → T19
- T17 (SettingsAdapter): T3 → T18
- T18 (ModuleWiring): T2, T10, T11, T17 → T19, T22, T23
- T19 (Scheduler): T2, T16, T18 → T23
- T20 (ExtendPublishedCall): T4 → T21
- T21 (ConsumerHandler): T7, T20 → T23
- T22 (Controllers): T2, T10, T18 → T23
- T23 (AppModuleIntegration): T1, T2, T18, T19, T21, T22 → F1-F4

### Agent Dispatch Summary

- **Wave 1**: 7 tasks → all `quick` (foundation, isolated, no domain logic)
- **Wave 2**: 6 tasks → T9 = `deep` (TDD pure logic with edge cases), T10/T13 = `unspecified-high` (persistence/cache complexity), T8/T11/T12 = `quick`
- **Wave 3**: 5 tasks → T14/T16 = `unspecified-high` (orchestration), T15 = `quick`, T17 = `quick`, T18 = `unspecified-high` (wiring)
- **Wave 4**: 5 tasks → T19 = `deep` (cron concurrency + batch logic), T20 = `unspecified-high` (cross-BC entity change), T21 = `unspecified-high` (consumer pattern, isolated formatter), T22 = `quick`, T23 = `unspecified-high` (full integration)
- **FINAL**: 4 reviews in parallel

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

### Wave 1 — Foundation (7 parallel tasks)

- [ ] 1. Redis infrastructure (ioredis + module + docker-compose + package.json)

  **What to do**:
  - Add `ioredis` to `apps/backend/package.json` dependencies (`^5.4.1`)
  - Create `apps/backend/src/shared/common/redis/redis.module.ts` exporting `RedisService` (wrapper around `ioredis.Redis`)
  - `RedisService` exposes: `get(key)`, `set(key, value, ttlSec)`, `sadd(key, member)`, `smembers(key)`, `del(key)`, `expire(key, ttlSec)`, `pipeline()`
  - Connection config from `AppConfig.redis.*` (lazy connect, retry strategy with exponential backoff)
  - Add Redis service to `apps/backend/docker-compose.yml` (image `redis:7-alpine`, port 6379, volume, healthcheck)
  - Add `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` to `apps/backend/.env.example`
  - Register `RedisModule` as global (`@Global()`) so any BC can inject without imports

  **Must NOT do**:
  - Do NOT couple RedisService to milestone BC (must be reusable for future caches)
  - Do NOT add cache decorators or fancy abstractions
  - Do NOT configure Redis Cluster/Sentinel (single instance only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
  - **Reason**: Mechanical infra addition, no domain logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-7)
  - **Blocks**: T13 (RedisCache), T23 (AppModuleIntegration)
  - **Blocked By**: None

  **References**:
  - `apps/backend/src/shared/common/persistence/database.module.ts` — pattern for module registration with conditional providers
  - `apps/backend/docker-compose.yml` — pattern for service definitions with healthchecks
  - `apps/backend/src/shared/cache/token-image-cache.adapter.ts` — existing cache adapter for naming/style reference (in-memory, not Redis)

  **Acceptance Criteria**:
  - [ ] `apps/backend/src/shared/common/redis/redis.module.ts` exists, exports `RedisService`, marked `@Global()`
  - [ ] `docker-compose.yml` includes Redis service with healthcheck
  - [ ] `package.json` includes `ioredis` dependency
  - [ ] `npm run build` exits 0

  **QA Scenarios**:
  ```
  Scenario: Redis module boots and accepts a SET/GET round-trip
    Tool: Bash (docker + redis-cli)
    Preconditions: docker compose up -d; redis container healthy
    Steps:
      1. docker compose -f apps/backend/docker-compose.yml up -d redis
      2. sleep 3
      3. redis-cli -h localhost PING → expect "PONG"
      4. redis-cli -h localhost SET test:key "hello" EX 10 → expect "OK"
      5. redis-cli -h localhost GET test:key → expect "hello"
      6. redis-cli -h localhost DEL test:key → expect 1
    Expected Result: All Redis ops succeed
    Failure Indicators: Connection refused, timeout, AUTH error
    Evidence: .sisyphus/evidence/task-1-redis-roundtrip.txt
  ```

  **Commit**: YES (Wave 1 group)
  - Message: `feat(milestone): add redis infra`
  - Files: `apps/backend/package.json`, `apps/backend/docker-compose.yml`, `apps/backend/src/shared/common/redis/redis.module.ts`, `apps/backend/.env.example`

- [ ] 2. AppConfig extensions (milestone.* + redis.* sections)

  **What to do**:
  - Extend `AppConfig` interface in `apps/backend/src/shared/common/config/app.config.ts` with:
    ```ts
    milestone: {
      schedulerCron: string;            // default '*/5 * * * *'
      schedulerEnabled: boolean;        // default true
      schedulerBatchSize: number;       // default 30
      activeWindowHours: number;        // default 72
      redisCacheTtlSeconds: number;     // default 2592000 (30 days)
      redisKeyPrefix: string;           // default 'milestone:'
      dexScreenerTimeoutMs: number;     // default 5000
    }
    redis: {
      host: string;                     // default 'localhost'
      port: number;                     // default 6379
      password: string | null;
      db: number;                       // default 0
    }
    ```
  - Add parser functions: `parseMilestoneConfig(raw)` and `parseRedisConfig(raw)` following existing `parseHorizonList` pattern
  - Wire into the existing `registerAs('app', …)` factory

  **Must NOT do**:
  - Do NOT modify unrelated config sections
  - Do NOT add validation library (use simple defaults + log warnings)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
  - **Reason**: Mechanical config addition following existing patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-7)
  - **Blocks**: T18, T19, T22
  - **Blocked By**: None

  **References**:
  - `apps/backend/src/shared/common/config/app.config.ts:55-150` — existing analytics config block + parser pattern

  **Acceptance Criteria**:
  - [ ] `AppConfig` includes `milestone` and `redis` sections
  - [ ] All new env vars have defaults so app boots without env set
  - [ ] `npx tsc --noEmit -p apps/backend/tsconfig.json` exits 0

  **QA Scenarios**:
  ```
  Scenario: Config loads with defaults when env vars absent
    Tool: Bash (node REPL)
    Preconditions: clean env
    Steps:
      1. cd apps/backend && npx ts-node -e "import {appConfig} from './src/shared/common/config/app.config'; console.log(JSON.stringify(appConfig(), null, 2))"
      2. Assert output includes milestone.schedulerCron === '*/5 * * * *'
      3. Assert output includes redis.port === 6379
      4. Assert output includes milestone.activeWindowHours === 72
    Expected Result: Config loaded with defaults
    Evidence: .sisyphus/evidence/task-2-config-defaults.json
  ```

  **Commit**: YES (Wave 1 group)
  - Message: `feat(milestone): add milestone and redis config sections`
  - Files: `apps/backend/src/shared/common/config/app.config.ts`

- [ ] 3. MilestoneThresholdEntity (domain)

  **What to do**:
  - Create `apps/backend/src/token/milestone/domain/entities/milestone-threshold.entity.ts`
  - Aggregate extending `AggregateRoot<string>` (id = UUID)
  - Props: `multiple: number` (positive integer ≥2), `enabled: boolean` (default true), `createdAt`, `updatedAt`
  - Static factory `MilestoneThreshold.create(input: { multiple: number })` validates multiple is integer ≥2, throws DomainError otherwise
  - Static `rehydrate(input)` for DB reconstruction
  - Getters: `multiple`, `enabled`, `isActive`
  - Methods: `disable()`, `enable()`

  **Must NOT do**:
  - Do NOT add Telegram-related fields
  - Do NOT add ordering or priority fields

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-2, 4-7)
  - **Blocks**: T8, T10, T17
  - **Blocked By**: T6 (MilestoneMultiple VO)

  **References**:
  - `apps/backend/src/shared/kernel/aggregate-root.ts` — base class
  - `apps/backend/src/shared/kernel/domain-error.ts` — `DomainError`, `ErrorCode.VALIDATION`
  - `apps/backend/src/token/scoring/domain/value-objects/score-tier.vo.ts` — pattern for simple VO-like entities

  **Acceptance Criteria**:
  - [ ] File exists with full type definitions
  - [ ] `create({multiple: 2})` returns valid entity
  - [ ] `create({multiple: 1})` throws `DomainError(ErrorCode.VALIDATION)`
  - [ ] `create({multiple: 0})` throws `DomainError`
  - [ ] `create({multiple: 2.5})` throws (must be integer)
  - [ ] `disable()` / `enable()` work correctly

  **QA Scenarios**:
  ```
  Scenario: Unit tests for MilestoneThreshold.create
    Tool: Bash (jest)
    Preconditions: test file co-located
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="milestone-threshold.entity.spec"
      2. Assert all assertions pass
    Expected Result: 6+ tests green
    Evidence: .sisyphus/evidence/task-3-threshold-tests.txt
  ```

  **Commit**: YES (Wave 1 group)
  - Message: `feat(milestone): add MilestoneThreshold entity`
  - Files: `apps/backend/src/token/milestone/domain/entities/milestone-threshold.entity.ts`, `*.spec.ts`

- [ ] 4. MonitoredCall entity (domain)

  **What to do**:
  - Create `apps/backend/src/token/milestone/domain/entities/monitored-call.entity.ts`
  - Aggregate extending `AggregateRoot<string>` (id = `${chain}:${address.toLowerCase()}`)
  - Props: `chain: string`, `address: string`, `mcAtCall: number` (positive), `ticker: string | null`, `publishedAt: Date`, `lastEvaluatedAt: Date | null`, `lastEvaluatedMultiple: number | null`, `isActive: boolean` (default true), `registeredAt: Date`
  - Static `MonitoredCall.register(input)` validates mcAtCall > 0, throws if invalid
  - Static `rehydrate(input)` for DB
  - Getters: `chain`, `address`, `mcAtCall`, `ticker`, `publishedAt`, `lastEvaluatedAt`, `lastEvaluatedMultiple`, `isActive`, `ageMs`, `isStale(maxAgeMs)`
  - Methods: `recordEvaluation(multiple, at)`, `deactivate()`

  **Must NOT do**:
  - Do NOT include any telegram/channel/publisher fields
  - Do NOT include notification history (that's NotifiedMilestone's job)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3, 5-7)
  - **Blocks**: T8, T10, T15, T20
  - **Blocked By**: T6 (MilestoneMultiple VO)

  **References**:
  - `apps/backend/src/token/call-tracking/domain/entities/call-evaluation-job.entity.ts:43` — pattern for ID composited from chain+address
  - `apps/backend/src/chain/explorer/domain/entities/token-snapshot.entity.ts:77` — pattern for normalized address (Solana case-sensitive, EVM lowercased)

  **Acceptance Criteria**:
  - [ ] File exists with full type definitions
  - [ ] `register({chain: 'solana', address: 'ABC', mcAtCall: 10000, publishedAt: new Date()})` returns entity with id `solana:ABC`
  - [ ] `register({chain: 'ethereum', address: '0xABC', mcAtCall: 10000, ...})` returns id `ethereum:0xabc` (lowercased)
  - [ ] `register({mcAtCall: 0})` throws DomainError
  - [ ] `recordEvaluation(2.5, now)` updates lastEvaluatedAt + lastEvaluatedMultiple
  - [ ] `deactivate()` sets isActive = false

  **QA Scenarios**:
  ```
  Scenario: Unit tests for MonitoredCall entity
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="monitored-call.entity.spec"
    Expected Result: 8+ tests green
    Evidence: .sisyphus/evidence/task-4-monitored-call-tests.txt
  ```

  **Commit**: YES (Wave 1 group)
  - Files: `apps/backend/src/token/milestone/domain/entities/monitored-call.entity.ts`, `*.spec.ts`

- [ ] 5. NotifiedMilestone entity (domain)

  **What to do**:
  - Create `apps/backend/src/token/milestone/domain/entities/notified-milestone.entity.ts`
  - Aggregate extending `AggregateRoot<string>` (id = UUID)
  - Props: `callId: string` (`chain:address`), `chain: string`, `address: string`, `threshold: number`, `athMultiple: number`, `currentMc: number`, `notifiedAt: Date`
  - Static `NotifiedMilestone.record(input)` validates threshold ≥2, mcNow > 0, throws DomainError otherwise
  - Static `rehydrate(input)` for DB
  - Getters: all props
  - Used as the durable source of truth for "this call already notified at this threshold"

  **Must NOT do**:
  - Do NOT store message text or telegram message IDs (those belong to consumers)
  - Do NOT include retry logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4, 6-7)
  - **Blocks**: T8, T10, T14
  - **Blocked By**: T6

  **References**:
  - `apps/backend/src/telegram/shared/domain/entities/published-call.entity.ts:35` — AggregateRoot pattern with normalized chain+address id

  **Acceptance Criteria**:
  - [ ] File exists with full type definitions
  - [ ] `record({threshold: 2, mcNow: 25000, ...})` returns valid entity
  - [ ] `record({threshold: 1})` throws DomainError
  - [ ] `record({mcNow: 0})` throws DomainError

  **QA Scenarios**:
  ```
  Scenario: Unit tests for NotifiedMilestone.record
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="notified-milestone.entity.spec"
    Expected Result: 5+ tests green
    Evidence: .sisyphus/evidence/task-5-notified-tests.txt
  ```

  **Commit**: YES (Wave 1 group)
  - Files: `apps/backend/src/token/milestone/domain/entities/notified-milestone.entity.ts`, `*.spec.ts`

- [ ] 6. MilestoneMultiple value object

  **What to do**:
  - Create `apps/backend/src/token/milestone/domain/value-objects/milestone-multiple.vo.ts`
  - Extends `ValueObject<{value: number}>`
  - `value: number` represents the multiple (e.g., 2, 3, 4.5)
  - Static `MilestoneMultiple.from(athMultiple: number)` — returns VO if finite + > 0, throws DomainError otherwise
  - Static `MilestoneMultiple.fromOptional(athMultiple: number | null)` — returns `null` if input null/undefined/NaN/non-positive
  - Getters: `value`, `isAtLeast(threshold)`, `formatted` (returns "2.00x", "10.50x", etc.)

  **Must NOT do**:
  - Do NOT add telegram-related fields
  - Do NOT couple to specific thresholds (single VO, configurable list elsewhere)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-5, 7)
  - **Blocks**: T3, T4, T5, T7
  - **Blocked By**: None

  **References**:
  - `apps/backend/src/shared/kernel/value-object.ts` — base class
  - `apps/backend/src/token/call-tracking/domain/value-objects/call-performance.vo.ts:21` — pattern for VO with constructor + factory

  **Acceptance Criteria**:
  - [ ] File exists
  - [ ] `MilestoneMultiple.from(2.5)` returns VO with value 2.5
  - [ ] `MilestoneMultiple.from(-1)` throws
  - [ ] `MilestoneMultiple.from(NaN)` throws
  - [ ] `MilestoneMultiple.fromOptional(null)` returns null
  - [ ] `isAtLeast(2)` for value=3 returns true
  - [ ] `formatted` returns "2.00x" / "10.50x" / "100x"

  **QA Scenarios**:
  ```
  Scenario: Unit tests for MilestoneMultiple VO
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="milestone-multiple.vo.spec"
    Expected Result: 7+ tests green
    Evidence: .sisyphus/evidence/task-6-vo-tests.txt
  ```

  **Commit**: YES (Wave 1 group)
  - Files: `apps/backend/src/token/milestone/domain/value-objects/milestone-multiple.vo.ts`, `*.spec.ts`

- [ ] 7. Domain events (CallMilestoneReachedEvent + RegisterCallForMilestonesEvent)

  **What to do**:
  - Create `apps/backend/src/token/milestone/domain/events/call-milestone-reached.event.ts` extending `DomainEvent`:
    - `eventName = 'milestone.call.reached'`
    - `aggregateId = `${chain}:${address}``
    - Payload: `{ chain, address, ticker, mcAtCall, mcNow, multiple, thresholdReached, publishedAt, monitoredCallId }`
    - `toPayload()` returns ISO-stringified dates + plain object
  - Create `apps/backend/src/token/milestone/domain/events/register-call-for-milestones.event.ts`:
    - `eventName = 'milestone.register.call'`
    - Payload: `{ chain, address, mcAtCall, ticker, publishedAt, sourceContext }` (sourceContext = 'vip-calls-channel' or other — free string)
  - Both events `Object.freeze` payload in constructor

  **Must NOT do**:
  - Do NOT include telegram chat IDs, channel names, or bot tokens in any event payload (these are consumer concerns)
  - Do NOT include message text (consumers format their own)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-6)
  - **Blocks**: T14, T15, T21
  - **Blocked By**: T6

  **References**:
  - `apps/backend/src/shared/kernel/domain-event.ts` — base class
  - `apps/backend/src/telegram/shared/domain/events/call-published.event.ts` — closest pattern for output event

  **Acceptance Criteria**:
  - [ ] Both event files exist with full type definitions
  - [ ] Event names match exactly: `milestone.call.reached`, `milestone.register.call`
  - [ ] Payload is frozen (Object.freeze in constructor)
  - [ ] `toPayload()` returns ISO-stringified dates
  - [ ] No telegram/chat/channel references anywhere in the files

  **QA Scenarios**:
  ```
  Scenario: Unit tests for both events
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="milestone.*\.event\.spec"
    Expected Result: 6+ tests green (3 per event: constructor freeze, toPayload conversion, eventName)
    Evidence: .sisyphus/evidence/task-7-events-tests.txt

  Scenario: Zero telegram imports in events
    Tool: Bash (grep)
    Steps:
      1. grep -r "telegram\|chatId\|botToken\|channel" apps/backend/src/token/milestone/domain/events/ → expect empty
    Evidence: .sisyphus/evidence/task-7-no-telegram-imports.txt
  ```

  **Commit**: YES (Wave 1 group)
  - Files: `apps/backend/src/token/milestone/domain/events/{call-milestone-reached,register-call-for-milestones}.event.ts`, `*.spec.ts`

### Wave 2 — BC core (6 parallel tasks)

- [ ] 8. Application ports (repositories + cache + live MC interfaces)

  **What to do**:
  - Create 5 port interfaces in `apps/backend/src/token/milestone/application/ports/`:
    1. `MilestoneThresholdRepository` — `findEnabled()`, `findAll()`, `findByMultiple(multiple)`, `save(threshold)`, `replaceAll(thresholds[])`, `count()`
    2. `MonitoredCallRepository` — `findByChainAndAddress(chain, address)`, `findActive(maxAgeMs, limit)`, `save(call)`, `updateLastEvaluated(id, multiple, at)`, `deactivate(id)`
    3. `NotifiedMilestoneRepository` — `findByCall(callId)`, `findThresholdsForCall(callId)`, `existsByCallAndThreshold(callId, threshold)`, `save(notified)`, `countByCall(callId)`
    4. `MilestoneCachePort` — `getNotifiedThresholds(callId)`, `addNotifiedThreshold(callId, threshold)`, `invalidateCall(callId)`. Returns `Set<number>` of thresholds already notified for that call.
    5. `LiveMarketDataPort` — `fetchCurrentMc(chain, address): Promise<number | null>`, `fetchCurrentMcBatch(items: {chain, address}[]): Promise<Map<string, number>>`. Returns null on error/zero.

  **Must NOT do**:
  - Do NOT include any telegram-related methods
  - Do NOT couple to specific storage technology (use abstract return types)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 9-13)
  - **Blocks**: T10, T11, T13, T14, T15, T16
  - **Blocked By**: T3, T4, T5

  **References**:
  - `apps/backend/src/token/call-tracking/application/ports/call-performance.repository.ts` — abstract repository pattern
  - `apps/backend/src/chain/explorer/application/ports/token-snapshot.repository.ts` — `findByChainAndAddress` pattern

  **Acceptance Criteria**:
  - [ ] All 5 port files exist with abstract class declarations
  - [ ] Each port is framework-agnostic (no TypeORM, no ioredis imports)
  - [ ] `npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: TypeScript compilation passes
    Tool: Bash
    Steps:
      1. cd apps/backend && npx tsc --noEmit
    Expected Result: exit 0
    Evidence: .sisyphus/evidence/task-8-tsc.txt
  ```

  **Commit**: YES (Wave 2 group)
  - Files: `apps/backend/src/token/milestone/application/ports/{milestone-threshold,monitored-call,notified-milestone}.repository.ts`, `milestone-cache.port.ts`, `live-market-data.port.ts`

- [ ] 9. DetectCrossedMilestonesService (TDD-first pure logic)

  **What to do**:
  - **TDD FIRST**: Write `apps/backend/src/token/milestone/application/services/detect-crossed-milestones.service.spec.ts` BEFORE implementation
  - Create `apps/backend/src/token/milestone/application/services/detect-crossed-milestones.service.ts`
  - Class `DetectCrossedMilestonesService` with single method:
    ```ts
    detect(input: {
      athMultiple: number | null
      enabledThresholds: ReadonlyArray<{ multiple: number }>
      alreadyNotified: ReadonlySet<number>
    }): { crossed: ReadonlyArray<{ multiple: number }> }
    ```
  - Logic:
    - If `athMultiple` is null/≤0 → return `{crossed: []}`
    - Filter enabled thresholds where `multiple <= athMultiple`
    - Filter out thresholds in `alreadyNotified`
    - Return sorted ascending by `multiple`
  - Pure function — no I/O, no DI, no side effects

  **Must NOT do**:
  - Do NOT add side effects (logging, persistence, events)
  - Do NOT couple to specific entity types (operates on plain objects)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`
  - **Reason**: Pure logic with edge cases (nulls, duplicates, ordering) — TDD-first requires careful test design

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 10-13)
  - **Blocks**: T16
  - **Blocked By**: T3

  **References**:
  - `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts` — pure orchestration pattern

  **Test cases (written FIRST)**:
  - crosses [2x] when athMultiple=2.0
  - crosses [2x, 3x] when athMultiple=3.0
  - crosses [2x, 3x, 5x, 10x] when athMultiple=10.5
  - crosses nothing when athMultiple=1.5
  - crosses nothing when athMultiple=2.0 but 2x already in alreadyNotified
  - crosses nothing when athMultiple=null
  - crosses nothing when athMultiple=0
  - crosses nothing when enabledThresholds is empty
  - returns sorted ascending even if input is unsorted
  - handles non-integer thresholds (e.g., 2.5x)
  - no duplicate thresholds in result

  **Acceptance Criteria**:
  - [ ] Spec file exists with all 11+ test cases
  - [ ] Implementation file exists
  - [ ] All tests pass: `npx jest --testPathPattern="detect-crossed-milestones.service.spec"` → green
  - [ ] No side effects

  **QA Scenarios**:
  ```
  Scenario: All detect-crossed tests pass
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="detect-crossed-milestones.service.spec" --verbose
    Expected Result: 11+ tests, all pass
    Evidence: .sisyphus/evidence/task-9-detect-tests.txt
  ```

  **Commit**: YES (Wave 2 group)
  - Files: `apps/backend/src/token/milestone/application/services/detect-crossed-milestones.service.ts`, `*.spec.ts`

- [ ] 10. TypeORM persistence (orm entities + repos + entity registration)

  **What to do**:
  - Create 3 ORM entities in `apps/backend/src/token/milestone/infrastructure/persistence/typeorm/entities/`:
    1. `MilestoneThresholdOrmEntity` — `@Entity('milestone_thresholds')`, columns: `id` (uuid PK), `multiple` (numeric(10,2), unique index), `enabled` (boolean default true), `created_at`, `updated_at`
    2. `MonitoredCallOrmEntity` — `@Entity('monitored_calls')`, PK: `id` (varchar), columns: `chain`, `address`, `mc_at_call` (numeric 20,4), `ticker`, `published_at` (timestamptz), `last_evaluated_at` (timestamptz nullable), `last_evaluated_multiple` (real nullable), `is_active` (boolean default true), `registered_at` (timestamptz). Indexes on `(is_active, registered_at)`.
    3. `NotifiedMilestoneOrmEntity` — `@Entity('notified_milestones')`, columns: `id` (uuid PK), `call_id` (varchar), `chain`, `address`, `threshold` (numeric 10,2), `ath_multiple` (real), `current_mc` (numeric 20,4), `notified_at` (timestamptz). Unique index on `(call_id, threshold)`.
  - Create 3 mappers (domain ↔ ORM) following `apps/backend/src/chain/explorer/infrastructure/persistence/typeorm/mappers/token-snapshot.mapper.ts` pattern
  - Create 3 TypeORM repository implementations
  - Register ORM entities in `apps/backend/src/shared/common/persistence/database.module.ts` (extend the existing `entities` array inside the `isDatabaseEnabled()` ternary)

  **Must NOT do**:
  - Do NOT include telegram-related columns
  - Do NOT add migration scripts (synchronize:true auto-creates)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - **Reason**: Persistence layer with multiple entities, mappers, TypeORM-specific concerns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-9, 11-13)
  - **Blocks**: T14, T15, T16, T22
  - **Blocked By**: T3, T4, T5, T8

  **References**:
  - `apps/backend/src/chain/explorer/infrastructure/persistence/typeorm/entities/token-snapshot.entity.ts` — full ORM entity pattern
  - `apps/backend/src/chain/explorer/infrastructure/persistence/typeorm/mappers/token-snapshot.mapper.ts`
  - `apps/backend/src/chain/explorer/infrastructure/persistence/typeorm/repositories/typeorm-token-snapshot.repository.ts`
  - `apps/backend/src/shared/common/persistence/database.module.ts`

  **Acceptance Criteria**:
  - [ ] 3 ORM entity files exist with correct columns + indexes
  - [ ] 3 mapper files exist
  - [ ] 3 TypeORM repo files implement the port interfaces
  - [ ] DatabaseModule registers the 3 entities
  - [ ] `npm run build` exits 0
  - [ ] DB auto-creates 3 tables on boot

  **QA Scenarios**:
  ```
  Scenario: Tables auto-created in DB
    Tool: Bash (psql)
    Preconditions: docker compose up -d postgres; DATABASE_ENABLED=true; backend started
    Steps:
      1. psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -c "\dt milestone_*"
      2. psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -c "\dt monitored_calls"
      3. Assert all 3 tables listed
    Expected Result: 3 tables present
    Evidence: .sisyphus/evidence/task-10-tables-created.txt

  Scenario: Unique index prevents duplicate notification
    Tool: Bash (psql)
    Steps:
      1. INSERT INTO notified_milestones (id, call_id, chain, address, threshold, ath_multiple, current_mc, notified_at) VALUES (gen_random_uuid(), 'solana:ABC', 'solana', 'ABC', 5, 5.5, 55000, now());
      2. Attempt duplicate with same call_id+threshold → expect unique violation
    Expected Result: unique constraint enforced
    Evidence: .sisyphus/evidence/task-10-unique-constraint.txt
  ```

  **Commit**: YES (Wave 2 group)
  - Files: `apps/backend/src/token/milestone/infrastructure/persistence/typeorm/**/*.ts`, `apps/backend/src/shared/common/persistence/database.module.ts`

- [ ] 11. In-memory repos (for DATABASE_ENABLED=false)

  **What to do**:
  - Create 3 in-memory repository implementations in `apps/backend/src/token/milestone/infrastructure/repositories/`:
    1. `InMemoryMilestoneThresholdRepository` — uses `Map<string, MilestoneThreshold>`, with `replaceAll()` that clears the map
    2. `InMemoryMonitoredCallRepository` — uses `Map<string, MonitoredCall>`, MAX 5000 entries with LRU eviction on overflow (matches `InMemoryPublishedCallRepository` pattern)
    3. `InMemoryNotifiedMilestoneRepository` — uses `Map<string, NotifiedMilestone>` keyed by id, with secondary index `Map<string, Set<number>>` keyed by callId for fast `existsByCallAndThreshold` and `findThresholdsForCall`
  - All implement the port interfaces from T8

  **Must NOT do**:
  - Do NOT add persistence beyond in-memory

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-10, 12-13)
  - **Blocks**: T18
  - **Blocked By**: T3, T4, T5, T8

  **References**:
  - `apps/backend/src/telegram/vip-calls-channel/infrastructure/repositories/in-memory-published-call.repository.ts` — LRU pattern + Map storage

  **Acceptance Criteria**:
  - [ ] 3 in-memory repo files exist
  - [ ] Each implements full port interface
  - [ ] LRU eviction works in `InMemoryMonitoredCallRepository`
  - [ ] Secondary index in `InMemoryNotifiedMilestoneRepository` keeps `existsByCallAndThreshold` O(1)
  - [ ] Unit tests for each (15+ tests total)

  **QA Scenarios**:
  ```
  Scenario: In-memory repos unit tests pass
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="in-memory-.*-milestone" --verbose
    Expected Result: 15+ tests green
    Evidence: .sisyphus/evidence/task-11-inmemory-tests.txt
  ```

  **Commit**: YES (Wave 2 group)
  - Files: `apps/backend/src/token/milestone/infrastructure/repositories/*.ts`, `*.spec.ts`

- [ ] 12. DexScreener live MC adapter (with batch support)

  **What to do**:
  - Create `apps/backend/src/token/milestone/infrastructure/adapters/dexscreener-live-mc.adapter.ts`
  - Extends `LiveMarketDataPort`
  - Inject `HttpService` (axios-based)
  - Implement:
    - `fetchCurrentMc(chain, address)`: GET `https://api.dexscreener.com/latest/dex/tokens/{address}` with 5s timeout. Return `bestPair.marketCap ?? bestPair.fdv ?? null`. If 0 or error, return null.
    - `fetchCurrentMcBatch(items)`: split into chunks of 30, call API per chunk in parallel (`Promise.allSettled`). For each chunk, parse response and map to `Map<chain:address, number>`. Log per-chunk errors.
  - Inject `AppConfig.milestone.dexScreenerTimeoutMs` for timeout

  **Must NOT do**:
  - Do NOT store or cache results (caller decides persistence)
  - Do NOT compute multiples (caller does that)
  - Do NOT emit events

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-11, 13)
  - **Blocks**: T16
  - **Blocked By**: None

  **References**:
  - `apps/backend/src/token/call-tracking/infrastructure/adapters/dexscreener-call-outcome-evaluator.adapter.ts:48-100` — existing DexScreener usage

  **Acceptance Criteria**:
  - [ ] File exists, extends `LiveMarketDataPort`
  - [ ] `fetchCurrentMc` returns null on error/empty/no-marketcap
  - [ ] `fetchCurrentMcBatch` processes up to 30 addresses per HTTP call
  - [ ] `fetchCurrentMcBatch` handles partial failures
  - [ ] Unit tests with mocked HttpService (8+ tests)

  **QA Scenarios**:
  ```
  Scenario: Adapter handles DexScreener responses
    Tool: Bash (jest with mocked HttpService)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="dexscreener-live-mc.adapter.spec"
    Expected Result: 8+ tests green
    Evidence: .sisyphus/evidence/task-12-dexscreener-tests.txt
  ```

  **Commit**: YES (Wave 2 group)
  - Files: `apps/backend/src/token/milestone/infrastructure/adapters/dexscreener-live-mc.adapter.ts`, `*.spec.ts`

- [ ] 13. Redis cache adapter (read-through pattern)

  **What to do**:
  - Create `apps/backend/src/token/milestone/infrastructure/redis/milestone-redis.cache.ts`
  - Implements `MilestoneCachePort`
  - Uses `RedisService` from `shared/common/redis/redis.module.ts` (injected)
  - Key pattern: `${prefix}notified:${callId}` where prefix = `AppConfig.milestone.redisKeyPrefix` ('milestone:' default)
  - Data structure: Redis SET of threshold numbers (members are stringified numbers)
  - Methods:
    - `getNotifiedThresholds(callId)`: `SMEMBERS`, parse each string to number, return `Set<number>`. On Redis error, log warn and return empty set (fallback to DB)
    - `addNotifiedThreshold(callId, threshold)`: `SADD` + `EXPIRE` (set TTL). On Redis error, log warn but don't fail (DB is source of truth)
    - `invalidateCall(callId)`: `DEL` key
  - TTL: `AppConfig.milestone.redisCacheTtlSeconds` (30 days default)
  - Inject Logger

  **Must NOT do**:
  - Do NOT throw on Redis errors (graceful degradation)
  - Do NOT store anything other than threshold numbers per call
  - Do NOT couple to milestone domain entities

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - **Reason**: Cache patterns + failure isolation + read-through semantics

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-12)
  - **Blocks**: T14, T16
  - **Blocked By**: T1, T8

  **References**:
  - `apps/backend/src/shared/cache/token-image-cache.adapter.ts` — existing cache adapter for naming/style

  **Acceptance Criteria**:
  - [ ] File exists, implements `MilestoneCachePort`
  - [ ] Redis errors logged but don't throw
  - [ ] TTL set on every key write
  - [ ] Unit tests with mocked RedisService (10+ tests)

  **QA Scenarios**:
  ```
  Scenario: Cache adapter unit tests pass
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="milestone-redis.cache.spec"
    Expected Result: 10+ tests green
    Evidence: .sisyphus/evidence/task-13-redis-cache-tests.txt

  Scenario: Live Redis end-to-end test
    Tool: Bash (redis-cli)
    Preconditions: docker compose up -d redis
    Steps:
      1. SADD milestone:notified:solana:ABC 2 3 5
      2. Use adapter via small node script to getNotifiedThresholds('solana:ABC')
      3. Assert result is Set {2, 3, 5}
      4. TTL milestone:notified:solana:ABC → expect ≤ 2592000
    Expected Result: live redis roundtrip works
    Evidence: .sisyphus/evidence/task-13-redis-e2e.txt
  ```

  **Commit**: YES (Wave 2 group)
  - Files: `apps/backend/src/token/milestone/infrastructure/redis/milestone-redis.cache.ts`, `*.spec.ts`

### Wave 3 — Use cases + module (5 parallel tasks)

- [ ] 14. RecordNotifiedMilestoneUseCase (persist + emit event)

  **What to do**:
  - **TDD FIRST**: Write spec file `record-notified-milestone.use-case.spec.ts` BEFORE implementation
  - Create `apps/backend/src/token/milestone/application/handlers/record-notified-milestone.use-case.ts`
  - Class `RecordNotifiedMilestoneUseCase`:
    - Constructor injects: `NotifiedMilestoneRepository`, `MilestoneCachePort`, `MilestoneEventPublisher` (new port for emitting `milestone.*` events)
    - Method `execute(input: { monitoredCall: MonitoredCall; threshold: number; multiple: number; currentMc: number })`:
      1. Check `existsByCallAndThreshold(callId, threshold)` → if already notified, return `{skipped: true}`
      2. Create `NotifiedMilestone.record({...})`
      3. `repo.save(notified)`
      4. `cache.addNotifiedThreshold(callId, threshold)` (fire-and-forget)
      5. Emit `CallMilestoneReachedEvent` via publisher
      6. Return `{recorded: true, event: CallMilestoneReachedEvent}`
  - Idempotent: re-running for same (call, threshold) is a no-op

  **Must NOT do**:
  - Do NOT inject any telegram-related port
  - Do NOT add retry logic (caller handles failures)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 15-18)
  - **Blocks**: T16
  - **Blocked By**: T7, T8, T10, T13

  **References**:
  - `apps/backend/src/telegram/shared/application/ports/publishing-event.publisher.ts` — event publisher port pattern
  - `apps/backend/src/shared/common/messaging/in-process-publishing-event.publisher.ts` — implementation pattern

  **Test cases (FIRST)**:
  - records new milestone and emits event
  - skips when already exists in DB
  - updates cache after save
  - does not throw on cache failure (logs and continues)
  - emits correct event payload (chain, address, threshold, multiple, mcAtCall, mcNow, publishedAt)

  **Acceptance Criteria**:
  - [ ] Spec file with 5+ tests
  - [ ] Implementation exists
  - [ ] All tests green

  **QA Scenarios**:
  ```
  Scenario: RecordNotifiedMilestoneUseCase tests pass
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="record-notified-milestone.use-case.spec" --verbose
    Expected Result: 5+ tests green
    Evidence: .sisyphus/evidence/task-14-record-tests.txt
  ```

  **Commit**: YES (Wave 3 group)
  - Files: `apps/backend/src/token/milestone/application/handlers/record-notified-milestone.use-case.ts`, `apps/backend/src/token/milestone/application/ports/milestone-event.publisher.ts`, `*.spec.ts`

- [ ] 15. RegisterMonitoredCallUseCase + @OnEvent handler

  **What to do**:
  - **TDD FIRST**: Write spec BEFORE implementation
  - Create `apps/backend/src/token/milestone/application/handlers/register-monitored-call.use-case.ts`:
    - Constructor injects: `MonitoredCallRepository`
    - Method `execute(input: { chain, address, mcAtCall, ticker, publishedAt, sourceContext }): Promise<MonitoredCall>`:
      1. If `findByChainAndAddress(chain, address)` exists → return existing (idempotent)
      2. Create `MonitoredCall.register({...})`
      3. `repo.save(call)`
      4. Return call
  - Create `apps/backend/src/token/milestone/infrastructure/event-bus/register-call-for-milestones.handler.ts`:
    - Inject `RegisterMonitoredCallUseCase`
    - `@OnEvent('milestone.register.call', { async: true })` method that unpacks event payload and calls the use case
    - Log warn on failure (do not throw)

  **Must NOT do**:
  - Do NOT listen for any telegram-related events (the milestone BC is agnostic — only `milestone.register.call`)
  - Do NOT add dedup logic beyond idempotent re-register

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 16-18)
  - **Blocks**: T20, T23
  - **Blocked By**: T7, T8, T10

  **References**:
  - `apps/backend/src/telegram/shared/infrastructure/messaging/in-process-publishing-event.publisher.ts` — event publisher pattern
  - `apps/backend/src/chain/explorer/infrastructure/event-bus/call-normalized.handler.ts` — @OnEvent handler pattern

  **Test cases (FIRST)**:
  - registers new call when none exists
  - returns existing call on re-register (idempotent)
  - validates mcAtCall > 0

  **Acceptance Criteria**:
  - [ ] Use case spec with 3+ tests
  - [ ] Handler spec with 2+ tests (mock event)
  - [ ] Both implementations exist
  - [ ] All tests green

  **QA Scenarios**:
  ```
  Scenario: Register + handler tests pass
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="(register-monitored-call|register-call-for-milestones.handler).spec" --verbose
    Expected Result: 5+ tests green
    Evidence: .sisyphus/evidence/task-15-register-tests.txt
  ```

  **Commit**: YES (Wave 3 group)
  - Files: `apps/backend/src/token/milestone/application/handlers/register-monitored-call.use-case.ts`, `apps/backend/src/token/milestone/infrastructure/event-bus/register-call-for-milestones.handler.ts`, `*.spec.ts`

- [ ] 16. EvaluateActiveCallsUseCase (per-batch orchestration)

  **What to do**:
  - **TDD FIRST**: Write spec BEFORE implementation
  - Create `apps/backend/src/token/milestone/application/handlers/evaluate-active-calls.use-case.ts`:
    - Constructor injects: `MonitoredCallRepository`, `LiveMarketDataPort`, `MilestoneThresholdRepository`, `MilestoneCachePort`, `NotifiedMilestoneRepository`, `DetectCrossedMilestonesService`, `RecordNotifiedMilestoneUseCase`, `ConfigService` (for `milestone.activeWindowHours`)
    - Method `execute(input: { batchSize?: number } = {}): Promise<{ evaluated: number; notified: number; skipped: number }>`:
      1. `maxAgeMs = config.milestone.activeWindowHours * 3600 * 1000`
      2. `activeCalls = monitoredCallRepo.findActive(maxAgeMs, batchSize ?? 30)`
      3. If empty → return `{evaluated: 0, notified: 0, skipped: 0}`
      4. `enabledThresholds = milestoneThresholdRepo.findEnabled()` → map to `{multiple}`
      5. `mcMap = liveMarketDataPort.fetchCurrentMcBatch(activeCalls.map(c => ({chain: c.chain, address: c.address})))`
      6. For each call:
         - `mcNow = mcMap.get(${chain}:${address})`
         - If `mcNow <= 0 || call.mcAtCall <= 0` → `monitoredCallRepo.updateLastEvaluated(id, null, now)` and continue
         - `multiple = mcNow / call.mcAtCall`
         - `alreadyNotified = cache.getNotifiedThresholds(callId)` then merge with `notifiedMilestoneRepo.findThresholdsForCall(callId)`
         - `crossed = detectCrossedMilestonesService.detect({athMultiple: multiple, enabledThresholds, alreadyNotified})`
         - For each crossed threshold → `recordNotifiedMilestoneUseCase.execute({...})`
         - `monitoredCallRepo.updateLastEvaluated(call.id, multiple, now)`
         - If `call.isStale(maxAgeMs)` → `monitoredCallRepo.deactivate(call.id)`
      7. Return aggregate counts
  - Concurrency-safe (idempotent re-entry)

  **Must NOT do**:
  - Do NOT directly publish to any telegram adapter (events only)
  - Do NOT add logging in inner loop (use summary log at end)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14-15, 17-18)
  - **Blocks**: T19
  - **Blocked By**: T9, T12, T14

  **References**:
  - `apps/backend/src/token/call-tracking/application/handlers/process-due-evaluation-jobs.use-case.ts` — batch processing pattern

  **Test cases (FIRST)**:
  - returns zeros when no active calls
  - skips call when mcNow is null
  - skips call when mcAtCall is invalid
  - records new milestones when multiple crosses enabled thresholds
  - skips already-notified thresholds (cache hit)
  - skips already-notified thresholds (DB fallback when cache empty)
  - merges cache + DB dedup sets correctly
  - deactivates stale calls after evaluation
  - updates lastEvaluatedAt + lastEvaluatedMultiple on each call
  - returns correct counts (evaluated/notified/skipped)

  **Acceptance Criteria**:
  - [ ] Spec with 10+ tests
  - [ ] Implementation exists
  - [ ] All tests green

  **QA Scenarios**:
  ```
  Scenario: EvaluateActiveCallsUseCase tests pass
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="evaluate-active-calls.use-case.spec" --verbose
    Expected Result: 10+ tests green
    Evidence: .sisyphus/evidence/task-16-evaluate-tests.txt
  ```

  **Commit**: YES (Wave 3 group)
  - Files: `apps/backend/src/token/milestone/application/handlers/evaluate-active-calls.use-case.ts`, `*.spec.ts`

- [ ] 17. Settings adapter + default threshold seed

  **What to do**:
  - Create `apps/backend/src/token/milestone/infrastructure/adapters/settings-milestone-settings.adapter.ts`:
    - Implements a port `MilestoneSettingsPort` (new port): `getDefaultThresholds(): ReadonlyArray<number>` returning `[2, 3, ..., 100]`
  - The default array is hardcoded constant exported from the adapter. When the BC grows, this port can be swapped for a DB-driven reader, but for now defaults are static.
  - ALSO create a `DefaultThresholdSeedService` in `apps/backend/src/token/milestone/application/services/`:
    - `@Injectable()`, runs on `OnModuleInit`
    - Calls `milestoneThresholdRepo.count()` → if 0 and `DATABASE_ENABLED=true`, generate `[2..100]`, create entities, `repo.save(all)` in a single transaction (or `replaceAll`)
    - In `DATABASE_ENABLED=false` mode, `InMemoryMilestoneThresholdRepository.replaceAll([...defaults])` is called from module init

  **Must NOT do**:
  - Do NOT seed via SQL migrations
  - Do NOT add UI to edit defaults (separate endpoint task)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14-16, 18)
  - **Blocks**: T18
  - **Blocked By**: T3

  **Acceptance Criteria**:
  - [ ] Adapter file exists with hardcoded `[2..100]` defaults
  - [ ] Seed service exists with `OnModuleInit` hook
  - [ ] Seed only runs when threshold table is empty
  - [ ] Spec with 3+ tests

  **QA Scenarios**:
  ```
  Scenario: Default thresholds populated on first boot
    Tool: Bash (psql + npm)
    Preconditions: clean DB
    Steps:
      1. docker compose down -v (wipe DB)
      2. docker compose up -d postgres
      3. npm run dev:backend (in background)
      4. Wait 10s
      5. psql -c "SELECT COUNT(*) FROM milestone_thresholds"
      6. Assert count === 99
      7. psql -c "SELECT multiple FROM milestone_thresholds ORDER BY multiple LIMIT 3"
      8. Assert first three are 2.00, 3.00, 4.00
    Expected Result: 99 thresholds seeded
    Evidence: .sisyphus/evidence/task-17-seed.txt
  ```

  **Commit**: YES (Wave 3 group)
  - Files: `apps/backend/src/token/milestone/infrastructure/adapters/settings-milestone-settings.adapter.ts`, `apps/backend/src/token/milestone/application/services/default-threshold-seed.service.ts`, `*.spec.ts`

- [ ] 18. MilestoneModule wiring

  **What to do**:
  - Create `apps/backend/src/token/milestone/milestone.module.ts`:
    - `@Module({})` with imports `[HttpModule, TypeOrmModule.forFeature([3 orm entities])]` (when DB enabled)
    - Providers:
      - Use cases: `RecordNotifiedMilestoneUseCase`, `RegisterMonitoredCallUseCase`, `EvaluateActiveCallsUseCase`, plus handler use cases (CRUD in T22)
      - Service: `DetectCrossedMilestonesService`, `DefaultThresholdSeedService`
      - Adapters: `DexscreenerLiveMcAdapter`, `MilestoneRedisCache`, `SettingsMilestoneSettingsAdapter`
      - Event publisher: `InProcessMilestoneEventPublisher` (new — mirrors `InProcessPublishingEventPublisher`)
      - Repos: `MilestoneThresholdRepository`, `MonitoredCallRepository`, `NotifiedMilestoneRepository`, `MilestoneCachePort`, `LiveMarketDataPort`, `MilestoneSettingsPort`, `MilestoneEventPublisher` (all with useClass/useExisting bindings)
      - Event handler: `RegisterCallForMilestonesHandler`
    - Exports: use cases + repos + ports (so future modules can consume)
  - Add MilestoneModule to `apps/backend/src/app.module.ts` imports

  **Must NOT do**:
  - Do NOT import any telegram module
  - Do NOT bind to a specific channel (channel-agnostic)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14-17)
  - **Blocks**: T19, T22, T23
  - **Blocked By**: T10, T11, T17

  **References**:
  - `apps/backend/src/telegram/vip-calls-channel/vip-calls.module.ts` — Nest module wiring pattern
  - `apps/backend/src/app.module.ts` — top-level module imports

  **Acceptance Criteria**:
  - [ ] `milestone.module.ts` exists with all providers
  - [ ] Module is added to `app.module.ts`
  - [ ] App boots without DI errors
  - [ ] Default thresholds seeded on first boot

  **QA Scenarios**:
  ```
  Scenario: Module wires correctly + boots
    Tool: Bash
    Steps:
      1. cd apps/backend && npm run build → exit 0
      2. docker compose up -d
      3. npm run dev:backend (background)
      4. Wait 15s, check logs for "Nest application successfully started"
      5. Stop backend
    Expected Result: app boots cleanly, all DI resolves
    Evidence: .sisyphus/evidence/task-18-boot.txt
  ```

  **Commit**: YES (Wave 3 group)
  - Files: `apps/backend/src/token/milestone/milestone.module.ts`, `apps/backend/src/app.module.ts`, `apps/backend/src/token/milestone/infrastructure/messaging/in-process-milestone-event.publisher.ts`

### Wave 4 — Scheduler + integration + consumer (5 parallel tasks)

- [ ] 19. LiveMilestoneScheduler (cron every 5 min)

  **What to do**:
  - Create `apps/backend/src/token/milestone/infrastructure/scheduling/live-milestone.scheduler.ts`:
    - `@Injectable()`, implements `OnModuleInit`, `OnModuleDestroy`
    - Inject: `SchedulerRegistry`, `ConfigService`, `EvaluateActiveCallsUseCase`
    - On init: register cron with `MILESTONE_SCHEDULER_CRON` (default `*/5 * * * *`), check `MILESTONE_SCHEDULER_ENABLED` (default true), `MILESTONE_SCHEDULER_BATCH_SIZE` (default 30)
    - On destroy: stop cron
    - **Concurrency guard**: `private running = false` — if previous tick still running, log debug and skip
    - `public async tick(): Promise<void>`:
      1. If `running` → return
      2. `running = true; try { … } finally { running = false }`
      3. Call `evaluateActiveCallsUseCase.execute({batchSize})`
      4. Log counts at info level
    - `@Cron(MILESTONE_SCHEDULER_CRON)` wrapper calls `tick()` (catch errors, log, never crash the scheduler)

  **Must NOT do**:
  - Do NOT couple to telegram (scheduler lives entirely in milestone BC)
  - Do NOT run blocking sync code in tick (use case is async)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`
  - **Reason**: Cron concurrency, lifecycle, error handling — needs careful state machine

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 20-23)
  - **Blocks**: T23
  - **Blocked By**: T2, T16, T18

  **References**:
  - `apps/backend/src/token/call-tracking/infrastructure/scheduling/background-evaluation.scheduler.ts:35-108` — full pattern

  **Acceptance Criteria**:
  - [ ] Scheduler exists with cron registration
  - [ ] Concurrency guard works (overlapping ticks skipped)
  - [ ] Cron disabled when `MILESTONE_SCHEDULER_ENABLED=false`
  - [ ] Cron expression respects `MILESTONE_SCHEDULER_CRON` env var
  - [ ] Manual `tick()` method exists (used by admin endpoint in T22)

  **QA Scenarios**:
  ```
  Scenario: Scheduler fires every 5 min and logs tick
    Tool: Bash (cron observation)
    Steps:
      1. npm run dev:backend
      2. Wait 6 min
      3. grep logs for "LiveMilestoneScheduler tick" → expect ≥1 match
    Expected Result: cron fires
    Evidence: .sisyphus/evidence/task-19-cron-fires.txt

  Scenario: Concurrent ticks are skipped
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="live-milestone.scheduler.spec" --verbose
    Expected Result: 3+ tests (concurrent skip, disabled, manual tick)
    Evidence: .sisyphus/evidence/task-19-scheduler-tests.txt
  ```

  **Commit**: YES (Wave 4 group)
  - Files: `apps/backend/src/token/milestone/infrastructure/scheduling/live-milestone.scheduler.ts`, `*.spec.ts`

- [ ] 20. Extend PublishedCall with mcAtCall + update VipCallsPublishUseCase

  **What to do**:
  - Modify `apps/backend/src/telegram/shared/domain/entities/published-call.entity.ts`:
    - Add `mcAtCall: number | null` to `PublishedCallProps` interface
    - Add `mcAtCall: number | null` to `PublishInput` interface (optional in input → null if absent)
    - Update `PublishedCall.create()` to accept and store `mcAtCall`
    - Update `PublishedCall.rehydrate()` to accept and store `mcAtCall`
    - Add getter `get mcAtCall(): number | null`
  - Modify `apps/backend/src/telegram/vip-calls-channel/application/handlers/vip-calls-publish.use-case.ts`:
    - Pass `mcAtCall: input.marketCapUsd ?? null` to `PublishedCall.create()`
  - Modify `apps/backend/src/telegram/vip-calls-channel/application/handlers/vip-calls-list-published.use-case.ts`:
    - Include `mcAtCall` in the `toView()` mapping
  - Modify `apps/backend/src/telegram/vip-calls-channel/api/http/vip-calls.controller.ts`:
    - Add `mcAtCall?: number | null` to `VipCallsPublishOutput`
  - Update TypeORM entity `published_calls` (find it via grep) to add `mc_at_call` column with migration

  **Must NOT do**:
  - Do NOT break existing PublishedCall rehydration (null mcAtCall for old records)
  - Do NOT change the publish endpoint signature (input already accepts marketCapUsd)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - **Reason**: Cross-BC entity change requiring careful backwards compat

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 19, 21-23)
  - **Blocks**: T21, T23
  - **Blocked By**: None

  **References**:
  - `apps/backend/src/telegram/shared/domain/entities/published-call.entity.ts:35-188` — current aggregate
  - `apps/backend/src/telegram/vip-calls-channel/application/handlers/vip-calls-publish.use-case.ts:93-105` — create call site
  - Search: `find apps/backend/src -name "*published-call*.entity.ts" -path "*/typeorm/*"` for the ORM entity

  **Acceptance Criteria**:
  - [ ] `PublishedCall` has new `mcAtCall` getter
  - [ ] `VipCallsPublishUseCase` passes `mcAtCall` from input
  - [ ] Existing tests for `PublishedCall` still pass (null mcAtCall OK)
  - [ ] TypeORM schema includes `mc_at_call` column
  - [ ] `VipCallsPublishOutput` includes `mcAtCall`

  **QA Scenarios**:
  ```
  Scenario: Existing PublishedCall tests still pass
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="published-call" --verbose
    Expected Result: all existing tests pass + new mcAtCall tests
    Evidence: .sisyphus/evidence/task-20-published-call-tests.txt

  Scenario: New schema has mc_at_call column
    Tool: Bash (psql)
    Steps:
      1. psql -c "\d published_calls"
      2. Assert output includes "mc_at_call" column
    Expected Result: column exists
    Evidence: .sisyphus/evidence/task-20-schema.txt
  ```

  **Commit**: YES (Wave 4 group)
  - Files: `apps/backend/src/telegram/shared/domain/entities/published-call.entity.ts`, `apps/backend/src/telegram/vip-calls-channel/application/handlers/*.ts`, `apps/backend/src/telegram/vip-calls-channel/api/http/vip-calls.controller.ts`, ORM entity + mappers

- [ ] 21. vip-calls-channel consumer handler + formatter method

  **What to do**:
  - Modify `apps/backend/src/telegram/vip-calls-channel/infrastructure/formatters/vip-message-formatter.adapter.ts`:
    - Add method `formatMilestoneMessage(input: { chain: string; address: string; ticker: string | null; mcAtCall: number; mcNow: number; multiple: number; thresholdReached: number; publishedAt: Date }): string`
    - Output format:
      ```
      🚀 MILESTONE {N}X HIT

      {chainEmoji} {chainLabel} | **{ticker}**
      MC at call: `{mcAtCall formatted}` → Now: `{mcNow formatted}`
      {multipleFormatted}x in {timeSince publishedAt}

      💎 Score: {score from chain_registry lookup, or omit}

      🦅 [Dexscreener](https://dexscreener.com/{chain}/{address})
      ```
  - Create `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/call-milestone-reached.handler.ts`:
    - `@Injectable()`, inject `VipCallsMessageFormatterAdapter`, `VipCallsBotApiPublisherAdapter`
    - `@OnEvent('milestone.call.reached', { async: true })` method that:
      1. Builds the message via formatter
      2. Calls `publisher.sendMessage('', message, undefined)`
      3. Logs success/failure (no throw — milestone is already recorded, this is best-effort delivery)
  - Register handler in `vip-calls.module.ts` providers
  - **Emit `milestone.register.call` from VipCallsPublishUseCase**: after successful publish, emit `RegisterCallForMilestonesEvent` via an event publisher (use the existing `PublishingEventPublisher` or a new generic one)

  **Must NOT do**:
  - Do NOT subscribe to any non-`milestone.*` events
  - Do NOT throw on send failure (best-effort)
  - Do NOT include raw event payload in the message (extract fields)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - **Reason**: Cross-BC consumer pattern, isolated formatter, idempotent registration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 19-20, 22-23)
  - **Blocks**: T23
  - **Blocked By**: T7, T20

  **References**:
  - `apps/backend/src/telegram/vip-calls-channel/infrastructure/formatters/vip-message-formatter.adapter.ts:22-105` — existing formatter
  - `apps/backend/src/telegram/vip-calls-channel/infrastructure/senders/bot-api-telegram-publisher.adapter.ts:58-98` — sender signature
  - `apps/backend/src/token/normalization/infrastructure/event-bus/call-parsed.handler.ts` — @OnEvent handler pattern

  **Acceptance Criteria**:
  - [ ] Formatter has new `formatMilestoneMessage` method
  - [ ] Handler subscribes only to `milestone.call.reached`
  - [ ] VipCallsPublishUseCase emits `milestone.register.call` after successful publish
  - [ ] Spec for formatter (5+ tests) and handler (3+ tests)
  - [ ] No imports from `src/token/milestone/` in handler (events are decoupled via event names)

  **QA Scenarios**:
  ```
  Scenario: Formatter produces correct Markdown
    Tool: Bash (jest)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="vip-message-formatter" --verbose
    Expected Result: existing tests pass + 5+ new tests
    Evidence: .sisyphus/evidence/task-21-formatter-tests.txt

  Scenario: Handler sends Telegram message on milestone event
    Tool: Bash (jest with mocked publisher)
    Steps:
      1. cd apps/backend && npx jest --testPathPattern="call-milestone-reached.handler" --verbose
    Expected Result: 3+ tests (happy path, publisher fail → log + continue, payload mapping)
    Evidence: .sisyphus/evidence/task-21-handler-tests.txt
  ```

  **Commit**: YES (Wave 4 group)
  - Files: `apps/backend/src/telegram/vip-calls-channel/infrastructure/formatters/vip-message-formatter.adapter.ts`, `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/call-milestone-reached.handler.ts`, `apps/backend/src/telegram/vip-calls-channel/vip-calls.module.ts`, `apps/backend/src/telegram/vip-calls-channel/application/handlers/vip-calls-publish.use-case.ts`, specs

- [ ] 22. HTTP controllers (CRUD thresholds + read APIs + admin tick)

  **What to do**:
  - Create `apps/backend/src/token/milestone/api/http/milestone.controller.ts`:
    - `@Controller('milestones')`
    - `GET /milestones/thresholds` → list enabled (or all) thresholds, returns `MilestoneThresholdView[]`
    - `PUT /milestones/thresholds` → replace all thresholds (body: `{ multiples: number[] }`)
    - `GET /milestones/calls/active` → list active monitored calls (paginated)
    - `GET /milestones/calls/:chain/:address/notifications` → history of notified milestones for a call
    - `POST /milestones/admin/tick` → manually trigger `LiveMilestoneScheduler.tick()` (admin endpoint, useful for testing)
    - `POST /milestones/admin/register` → manually register a call (testing)
  - Create supporting use cases:
    - `ListThresholdsUseCase` (inject `MilestoneThresholdRepository`)
    - `UpdateThresholdsUseCase` (inject repo + service)
    - `ListActiveMonitoredCallsUseCase`
    - `ListNotifiedMilestonesUseCase`
  - Add DTOs in `apps/backend/src/token/milestone/api/input/` with class-validator

  **Must NOT do**:
  - Do NOT add chat/channel/bot endpoints (consumer concern)
  - Do NOT expose dedup state directly (only via filtered endpoints)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 19-21, 23)
  - **Blocks**: T23
  - **Blocked By**: T2, T10, T18

  **References**:
  - `apps/backend/src/telegram/vip-calls-channel/api/http/vip-calls.controller.ts` — controller pattern
  - `apps/backend/src/settings/api/http/filters.controller.ts` — settings CRUD pattern

  **Acceptance Criteria**:
  - [ ] Controller has all 6 endpoints
  - [ ] DTOs validate input
  - [ ] PUT thresholds replaces all (transactional or atomic replace)
  - [ ] Admin endpoints gated by simple guard or env flag (suggest env flag `MILESTONE_ADMIN_ENABLED`)
  - [ ] Spec for each use case (5+ tests total)

  **QA Scenarios**:
  ```
  Scenario: GET /milestones/thresholds returns 99 defaults
    Tool: Bash (curl)
    Preconditions: app running with seeded thresholds
    Steps:
      1. curl -s http://localhost:3030/milestones/thresholds | jq 'length'
      2. Assert output is 99
    Expected Result: 99 thresholds
    Evidence: .sisyphus/evidence/task-22-list-thresholds.txt

  Scenario: PUT /milestones/thresholds replaces
    Tool: Bash (curl)
    Steps:
      1. curl -X PUT http://localhost:3030/milestones/thresholds -H 'Content-Type: application/json' -d '{"multiples":[2,5,10]}'
      2. curl -s http://localhost:3030/milestones/thresholds | jq 'length'
      3. Assert output is 3
      4. Restore defaults via PUT with `[2..100]`
    Expected Result: replace works
    Evidence: .sisyphus/evidence/task-22-put-thresholds.txt

  Scenario: POST /milestones/admin/tick triggers evaluation
    Tool: Bash (curl + psql)
    Preconditions: at least 1 monitored_call registered
    Steps:
      1. curl -X POST http://localhost:3030/milestones/admin/register -d '{...}' (register a call)
      2. psql -c "SELECT COUNT(*) FROM monitored_calls" → 1
      3. curl -X POST http://localhost:3030/milestones/admin/tick
      4. Wait 2s
      5. psql -c "SELECT COUNT(*) FROM notified_milestones" → ≥0
    Expected Result: tick endpoint works
    Evidence: .sisyphus/evidence/task-22-admin-tick.txt
  ```

  **Commit**: YES (Wave 4 group)
  - Files: `apps/backend/src/token/milestone/api/**/*.ts`, supporting use cases + specs

- [ ] 23. AppModule integration + smoke test + README

  **What to do**:
  - Update `apps/backend/src/app.module.ts`:
    - Import `RedisModule` (global), `MilestoneModule`, `ScheduleModule.forRoot()` if not already
    - Verify `ScheduleModule.forRoot()` is registered (it must be — call-tracking scheduler uses it)
  - Update `apps/backend/src/telegram/vip-calls-channel/vip-calls.module.ts`:
    - The `CallMilestoneReachedHandler` is already registered here via providers (T21)
  - Create `apps/backend/src/token/milestone/README.md`:
    - What the BC does, agnostic constraint, how to consume (event listeners), config env vars, examples
  - Run full smoke test (start backend, hit endpoints, observe Telegram message)

  **Must NOT do**:
  - Do NOT break existing module imports
  - Do NOT register RedisModule with limited scope (must be global)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 19-22)
  - **Blocks**: F1-F4
  - **Blocked By**: T1, T2, T18, T19, T21, T22

  **References**:
  - `apps/backend/src/app.module.ts` — current top-level imports
  - `apps/backend/README.md` — README style reference

  **Acceptance Criteria**:
  - [ ] AppModule imports RedisModule + MilestoneModule
  - [ ] App boots cleanly with all new pieces wired
  - [ ] End-to-end smoke test passes (publish → tick → telegram message)
  - [ ] `apps/backend/src/token/milestone/README.md` exists with usage docs

  **QA Scenarios**:
  ```
  Scenario: Full end-to-end smoke test
    Tool: Bash (curl + psql + redis-cli + Telegram)
    Preconditions: docker compose up; backend running; TELEGRAM_BOT_TOKEN + channel configured
    Steps:
      1. POST /vip-calls/publish with mcAtCall=10000 (via marketCapUsd)
      2. psql: SELECT * FROM monitored_calls → 1 row
      3. POST /milestones/admin/tick
      4. Wait 3s
      5. Verify a Telegram message appears in test channel (manual visual check OR webhook log)
      6. redis-cli: KEYS 'milestone:notified:*' → 1 key
    Expected Result: end-to-end works
    Evidence: .sisyphus/evidence/task-23-e2e.txt

  Scenario: App boots cleanly with all modules
    Tool: Bash
    Steps:
      1. cd apps/backend && npm run build → exit 0
      2. npm run dev:backend
      3. Wait 15s
      4. grep logs for "Nest application successfully started"
      5. Stop backend
    Expected Result: clean boot
    Evidence: .sisyphus/evidence/task-23-boot.txt
  ```

  **Commit**: YES (Wave 4 group)
  - Files: `apps/backend/src/app.module.ts`, `apps/backend/src/token/milestone/README.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": grep codebase for forbidden patterns (`telegram/` imports in `src/token/milestone/**`, message formatters, chat IDs, bot tokens). Verify 3 new tables exist in DB. Verify default thresholds `[2..100]` populated. Verify Redis keys present after first tick. Verify cron registered.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + `npm run lint` + `npm test -- --testPathPattern=milestone`. Review all new files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (publish → tick → notify → message in channel). Test edge cases: null mcNow, Redis down, DexScreener down, concurrent ticks, threshold disabled mid-flight. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: T14 (record) must NOT import from telegram. Detect unaccounted changes: any file modified outside the 23 planned tasks must be flagged.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(milestone): add foundation (entities, VO, events, redis infra, config)` — single atomic commit per wave
- **Wave 2**: `feat(milestone): add persistence, adapters, and detection service (TDD)`
- **Wave 3**: `feat(milestone): add use cases and module wiring`
- **Wave 4**: `feat(milestone): add live scheduler + vip-calls consumer + app integration`

Each commit must:
- Pass `npm run lint` and `npx tsc --noEmit`
- Pass existing 306 tests + new TDD tests for that wave
- Include only files explicitly listed in the wave's tasks
- Use conventional commits format

---

## Success Criteria

### Verification Commands

```bash
# All checks must pass
cd /Users/bryanstevens/dev/onchain-bot
npm run lint                                                    # → exit 0
npx tsc --noEmit -p apps/backend/tsconfig.json                  # → exit 0
npm test --prefix apps/backend -- --testPathPattern="milestone" # → all green
docker compose -f apps/backend/docker-compose.yml up -d         # → redis healthy
psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner \
  -c "SELECT COUNT(*) FROM milestone_thresholds;"               # → 99
psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner \
  -c "\d monitored_calls"                                       # → table exists
redis-cli -h localhost KEYS 'milestone:notified:*' | wc -l      # → 0 initially

# End-to-end smoke test
curl -X POST http://localhost:3030/vip-calls/publish \
  -H 'Content-Type: application/json' \
  -d '{"chain":"solana","address":"TEST_ADDR","score":85,"classification":"GOOD","ticker":"TEST","marketCapUsd":10000}'
curl -X POST http://localhost:3030/milestones/admin/tick        # manual tick
redis-cli -h localhost KEYS 'milestone:notified:*'              # → 1 key
```

### Final Checklist

- [ ] All "Must Have" present (verified by F1)
- [ ] All "Must NOT Have" absent (verified by F1: zero telegram imports in `src/token/milestone/**`)
- [ ] All TDD tests pass (F2)
- [ ] End-to-end QA scenarios pass (F3)
- [ ] Scope fidelity verified (F4)
- [ ] README updated for milestone BC (`apps/backend/src/token/milestone/README.md`)
- [ ] Draft deleted: `.sisyphus/drafts/milestone-notifications.md`