# Draft: Milestone Notifications for VIP Calls Channel

> **Status: done** — BC fue implementado en sesiones previas. Draft retenido para trazabilidad.

## Evidence (R1-R9 all met)

| Req | Component | Path |
|---|---|---|
| R1 (2x..100x notifications) | `DetectCrossedMilestonesService` + `EvaluateActiveCallsUseCase` | `apps/backend/src/token/milestone/application/services/` + `application/handlers/evaluate-active-calls.use-case.ts` |
| R2 (configurable thresholds) | `MilestoneThresholdRepository` (Port) + `TypeormMilestoneThresholdRepository` + default-seed via `DefaultThresholdsSeedService` | `apps/backend/src/token/milestone/infrastructure/persistence/` + `infrastructure/default-thresholds-seed.service.ts` |
| R3 (mcAtCall on publish) | `PublishedCall.mcAtCall?: number \| null` field | `apps/backend/src/telegram/shared/domain/entities/published-call.entity.ts:18,34,79,97,112` |
| R4 (DB + Redis dedup) | `NotifiedMilestoneRepository` (PG) + `RedisMilestoneCacheAdapter` + `InMemoryMilestoneCacheAdapter` | `apps/backend/src/token/milestone/infrastructure/adapters/` + `repositories/` |
| R5 (TDD) | Specs on: `evaluate-active-calls.use-case`, `record-notified-milestone.use-case`, `detect-crossed-milestones.service`, `call-milestone-reached.event`, all in-memory repos | see `.spec.ts` files |
| R6 (token/milestone BC) | full BC: `milestone.module.ts` mounted at root via app.module.ts | `apps/backend/src/token/milestone/milestone.module.ts` |
| R7 (multi-consumer design) | `MilestoneEventPublisher` Port (interface); current consumer = `MilestoneReachedHandler` in vip-calls-channel | `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/milestone-reached.handler.ts` |
| R8 (no KOL attribution) | `VipMessageFormatterAdapter.formatMilestoneMessage` (no KOL fields) | `apps/backend/src/telegram/vip-calls-channel/infrastructure/formatters/vip-message-formatter.adapter.ts:107` |
| R9 (Redis infra) | `RedisModule` (`@Global`) + `RedisMilestoneCacheAdapter` already wired | `apps/backend/src/shared/common/cache/redis.module.ts` |

## What's wired end-to-end

```
publishing.telegram.published
  → RegisterMonitoredCallUseCase (writes MonitoredCall)
  → LiveMilestoneScheduler (cron */5 * * * *)
    → EvaluateActiveCallsUseCase
      → DetectCrossedMilestonesService
      → RecordNotifiedMilestoneUseCase
        → emits CallMilestoneReachedEvent
  → MilestoneReachedHandler (vip-calls-channel)
    → VipMessageFormatterAdapter.formatMilestoneMessage
    → VipCallsBotApiPublisherAdapter.sendMessage → Telegram
```

## Known gaps (out of original scope)

- **No integration test** that exercises Redis end-to-end (only in-memory repo specs)
- **No QA scenarios** documented in `.omo/drafts/` for this BC (would require live channel + DexScreener API)
- **Settings-driven thresholds**: thresholds are stored as DB rows (`MilestoneThresholdEntity`) but the existing `SettingsMilestoneSettingsAdapter` returns hardcoded `DEFAULT_MILESTONE_THRESHOLDS = [2..100]` from the code, not from DB. The seed service populates DB on first boot so this works, but admin updates via DB rather than `SettingsService.getMilestoneThresholds()`.

## Original Requirements (all met)

- **R1**: Send Telegram notifications to vip-calls-channel when a published call hits ≥2x, 3x, 4x, … up to 100x. Every 1x starting from 2x.
- **R2**: Thresholds must be **configurable via DB + settings** (admin can change without redeploy). Default = `[2, 3, 4, …, 100]` literal (99 thresholds).
- **R3**: Baseline = **market cap OF THE SNAPSHOT** at publish time. Currently this is NOT stored on `PublishedCall` — needs to be added.
- **R4**: Dedup state in **DB + Redis** (DB durable, Redis fast cache).
- **R5**: Test strategy = **TDD**.
- **R6**: Architecture = new BC `token/milestone` as core, feeds vip-calls-channel (which consumes events and sends Telegram).
- **R7**: For now, only vip-calls-channel consumes (but design should allow other consumers).
- **R8**: No KOL attribution in milestone message. Just metrics.
- **R9**: No DB→Redis infrastructure exists yet. Need to add both.

## Technical Decisions

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  call-tracking BC (existing)                                   │
│  - BackgroundEvaluationScheduler (existing cron, one-shot)     │
│  - EvaluateCallPerformanceUseCase → saves CallPerformance      │
└────────────────────────┬───────────────────────────────────────┘
                         │ (reuse DexscreenerCallOutcomeEvaluatorAdapter)
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  token/milestone BC (NEW)                                      │
│                                                                │
│  LiveMilestoneScheduler (NEW cron, every 5min)                 │
│    │                                                            │
│    ├─ find active monitored calls (PublishedCall + age < N)    │
│    ├─ fetch current MC via DexScreener (batched)               │
│    ├─ compute currentMultiple = currentMc / mcAtCall           │
│    ├─ thresholds from MilestoneThresholdEntity (DB)            │
│    ├─ dedup: NotifiedMilestoneEntity (PG) + Redis cache        │
│    └─ emit CallMilestoneReachedEvent for each crossed          │
└────────────────────────┬───────────────────────────────────────┘
                         │ EventEmitter2: 'milestone.call.reached'
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  telegram/vip-calls-channel BC                                 │
│  - CallMilestoneReachedHandler (NEW @OnEvent)                  │
│  - VipCallsMessageFormatterAdapter.formatMilestoneMessage()    │
│  - VipCallsBotApiPublisherAdapter.sendMessage()               │
└────────────────────────────────────────────────────────────────┘
```

### File Structure

```
NEW:
  apps/backend/src/token/milestone/
    ├── api/http/milestone.controller.ts
    ├── api/input/update-thresholds.input.ts
    ├── application/handlers/
    │   ├── detect-call-milestone.use-case.ts
    │   ├── evaluate-and-record-milestone.use-case.ts
    │   ├── list-active-monitored-calls.use-case.ts
    │   ├── list-notified-milestones.use-case.ts
    │   ├── list-thresholds.use-case.ts
    │   └── update-thresholds.use-case.ts
    ├── application/ports/
    │   ├── milestone-threshold.repository.ts
    │   └── monitored-call.repository.ts
    ├── domain/entities/
    │   ├── milestone-threshold.entity.ts
    │   ├── monitored-call.entity.ts
    │   └── notified-milestone.entity.ts
    ├── domain/events/call-milestone-reached.event.ts
    ├── domain/value-objects/milestone-multiple.vo.ts
    ├── infrastructure/
    │   ├── persistence/typeorm/
    │   │   ├── entities/{milestone-threshold,monitored-call,notified-milestone}.orm.entity.ts
    │   │   └── repositories/{typeorm-*}*.repository.ts
    │   ├── in-memory-repositories/{in-memory-*}*.repository.ts
    │   ├── redis/milestone-redis.cache.ts
    │   ├── adapters/dexscreener-live-mc.adapter.ts
    │   ├── scheduling/live-milestone.scheduler.ts
    │   └── event-bus/call-milestone-reached.handler.ts
    └── milestone.module.ts

  apps/backend/src/shared/common/redis/
    └── redis.module.ts                        [ioredis provider + connection]
  apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/call-milestone-reached.handler.ts
  apps/backend/src/telegram/vip-calls-channel/application/handlers/notify-vip-call-milestone.use-case.ts

EXTEND:
  apps/backend/src/telegram/shared/domain/entities/published-call.entity.ts
    → add `mcAtCall: number | null` to props + getter + rehydrate + create
  apps/backend/src/telegram/vip-calls-channel/application/handlers/vip-calls-publish.use-case.ts
    → pass `mcAtCall` from input.marketCapUsd to PublishedCall.create()
  apps/backend/src/telegram/vip-calls-channel/infrastructure/formatters/vip-message-formatter.adapter.ts
    → add `formatMilestoneMessage()` method
  apps/backend/src/telegram/vip-calls-channel/vip-calls.module.ts
    → register new handler + use case
  apps/backend/src/app.module.ts
    → import RedisModule + MilestoneModule
  apps/backend/src/shared/common/config/app.config.ts
    → add milestone.{schedulerCron,schedulerEnabled,schedulerBatchSize,activeWindowHours,redis.*} config
  apps/backend/src/shared/common/persistence/database.module.ts
    → register new entities (when DATABASE_ENABLED=true)
  apps/backend/docker-compose.yml
    → add redis service
  apps/backend/package.json
    → add ioredis + @nestjs-modules/ioredis (or similar)

DEPS:
  apps/backend/package.json:
    + ioredis
    + @nestjs-modules/ioredis (or use raw ioredis provider — simpler)
```

### Entities / Tables

#### `milestone_thresholds` table (configurable, default-populated)
```ts
{
  id: UUID
  multiple: number          // e.g. 2, 3, 4, 5...
  enabled: boolean
  createdAt: timestamptz
  updatedAt: timestamptz
}
// Unique index on `multiple`
```

Default population: when DB is empty, auto-insert `[2, 3, ..., 100]`.

#### `monitored_calls` table (which calls are being watched)
```ts
{
  id: string              // chain:address
  chain: string
  address: string
  mcAtCall: number
  publishedAt: timestamptz
  ticker: string | null
  lastEvaluatedAt: timestamptz | null
  lastEvaluatedMultiple: number | null
  isActive: boolean       // false when manually stopped or > N hours old
}
```
- Created when a VIP call is published (via @OnEvent('publishing.telegram.published'))
- The VIP publish handler creates the MonitoredCall

#### `notified_milestones` table (dedup, source of truth)
```ts
{
  id: UUID
  callId: string          // FK to monitored_calls.id (or chain:address)
  threshold: number       // e.g. 5 (for "5x")
  athMultiple: number     // what the multiple was when notified
  currentMc: number
  notifiedAt: timestamptz
}
```
- Unique index on `(callId, threshold)` — prevents duplicate inserts

### Redis Cache
- Key pattern: `milestone:notified:{chain}:{address}` → Set<threshold number>
- TTL: 30 days (auto-cleanup)
- Read-through: if Redis has the set, use it; if not, load from PG

### Cron Logic (`LiveMilestoneScheduler`)

```ts
@Cron('*/5 * * * *')  // every 5 min, configurable
async tick() {
  if (this.running) return;  // guard against overlap
  this.running = true;
  try {
    const active = await this.monitoredCallRepo.findActive(maxAgeHours);
    // batch into chunks of 30 (DexScreener limit)
    for (const batch of chunk(active, 30)) {
      await this.processBatch(batch);
    }
  } finally {
    this.running = false;
  }
}

async processBatch(calls: MonitoredCall[]) {
  const mcMap = await this.dexscreener.fetchCurrentMcBatch(calls); // returns map<chain:address, mcNow>
  const thresholds = await this.thresholdRepo.findEnabled();
  
  for (const call of calls) {
    const mcNow = mcMap.get(`${call.chain}:${call.address}`);
    if (!mcNow || mcNow <= 0 || call.mcAtCall <= 0) continue;
    const multiple = mcNow / call.mcAtCall;
    
    const alreadyNotified = await this.notifiedCache.get(call.id);  // Set<number>
    const crossed = thresholds
      .filter(t => multiple >= t.multiple && !alreadyNotified.has(t.multiple));
    
    for (const t of crossed) {
      await this.evaluateAndRecord.execute({ call, threshold: t.multiple, multiple, mcNow });
    }
    
    await this.monitoredCallRepo.updateLastEvaluated(call.id, multiple);
  }
}
```

### Event Payload

```ts
class CallMilestoneReachedEvent extends DomainEvent {
  payload: {
    chain: string
    address: string
    ticker: string | null
    mcAtCall: number
    mcNow: number
    multiple: number          // e.g. 5.2
    thresholdReached: number  // e.g. 5
    publishedAt: Date
    monitoredCallId: string
  }
}
```

### Telegram Message Format (vip-calls-channel handler)

```
🚀 MILESTONE 5X HIT

🟣 $SOL | **PEPE2**
MC at call: `45.20K` → Now: `226.00K`
5.00x in 4h 12m

💎 Score: 87/100

🦅 [Dexscreener](https://dexscreener.com/solana/abc...)
```

(No KOL attribution per R8.)

### Configuration Defaults

```ts
// app.config.ts
milestone: {
  schedulerCron: '*/5 * * * *',
  schedulerEnabled: true,
  schedulerBatchSize: 30,
  activeWindowHours: 72,        // stop monitoring 72h after publish
  redisTtlSeconds: 30 * 24 * 3600,  // 30 days
}

redis: {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB ?? '0', 10),
}
```

### Default Thresholds Seed

When `milestone_thresholds` is empty (DB enabled mode), auto-insert `[2, 3, ..., 100]`. In DB-disabled mode, use the same list from code.

## Research Findings

- **Cron existing**: `BackgroundEvaluationScheduler` runs every 5min but is **one-shot per CallEvaluationJob** (horizon-based). Not reusable for live tracking. We create a new one.
- **DexScreener existing**: `DexscreenerCallOutcomeEvaluatorAdapter.evaluateCall()` returns `{mcNow, athMultiple, ...}`. Reusable as-is. For batching, we add a new `fetchCurrentMcBatch(addresses)` method that hits `/tokens/{addr1},{addr2},...` (DexScreener supports comma-separated addresses).
- **TokenSnapshot refresh**: Triggered ONLY by `CallNormalizedHandler` (event). No cron for periodic refresh. The snapshot's `marketCapUsd` is **NOT** the "at-call-time" MC — it's the latest fetched. We must capture MC separately at publish time.
- **mcAtCall flow**: `CallEvaluationJob` has `mcAtCall: number | null` but for vip-calls it's `null` (handler doesn't have it). **Fix**: add `mcAtCall` to `PublishedCall` entity, populate from publish input.
- **PublishedCall caller**: Only `VipCallsController.publish()` (HTTP). Admin/UI provides all fields including `marketCapUsd`.
- **Redis**: Confirmed NOT in deps or compose. Need to add ioredis + docker-compose entry + RedisModule provider.
- **Settings filter**: `SettingsFilterEntity` is extensible by type but uses generic `value`/`numericValue`. For thresholds (a list of numbers), cleaner to have dedicated `MilestoneThresholdEntity` with full CRUD.
- **No `analytics.evaluation.completed` event**: README mentions it but code doesn't emit. Not needed for our approach (we use live cron, not event-driven from evaluation).

## Open Questions

- (RESOLVED via question tool) Defaults = `[2..100]` literal, configurable.
- (RESOLVED via question tool) No KOL attribution, just metrics.
- (RESOLVED via question tool) Use existing vip-calls tokens.
- (RESOLVED via question tool) DB + Redis for dedup.
- (RESOLVED via question tool) TDD.

## Scope Boundaries

### IN
- New `token/milestone` BC end-to-end (domain, app, infra, scheduling)
- Modify `PublishedCall` to store `mcAtCall` (additive, non-breaking)
- New `RedisModule` in shared/common
- Modify vip-calls-channel: new handler + new formatter method
- Docker-compose update (add redis)
- Package.json update (add ioredis)
- App config (milestone + redis sections)
- Tests (TDD): unit tests for detect-call-milestone, evaluate-and-record, handlers, scheduler, repository
- QA scenarios (agent-executed): HTTP API, cron tick simulation, end-to-end Telegram send

### OUT
- KOL reputation impact (not asked)
- Frontend UI for milestones (not asked)
- Multi-channel fan-out (only vip-calls for now, but designed for extension)
- Migration of historical PublishedCall records (since we now require `mcAtCall`, historical records get null and are simply not monitored — backwards compatible)
- Rate limiting at the HTTP layer (already exists or not our concern)

## TDD Test Plan (HIGH-LEVEL)

Tests to write BEFORE implementation:

1. **`detect-call-milestone.use-case.spec.ts`** (pure logic)
   - crosses [2x] when multiple=2.0
   - crosses [2x, 3x] when multiple=3.0 (only new ones)
   - crosses [2x, 3x, 5x, 10x] when multiple=10.5
   - crosses nothing when multiple=1.5
   - crosses nothing when multiple=2.0 but 2x already notified
   - respects `enabled=false` thresholds
   - handles null mcNow gracefully
   - handles null mcAtCall gracefully

2. **`evaluate-and-record-milestone.use-case.spec.ts`** (orchestration)
   - happy path: persists notified_milestone, emits event, updates cache
   - emits correct CallMilestoneReachedEvent payload
   - does NOT emit when no thresholds crossed
   - dedup across multiple ticks

3. **`live-milestone.scheduler.spec.ts`**
   - processes only active calls (filters by isActive + age)
   - batches by 30 (DexScreener limit)
   - skips overlap when previous tick running
   - updates lastEvaluatedAt / lastEvaluatedMultiple after tick

4. **`call-milestone-reached.handler.spec.ts`** (vip-calls side)
   - formats and sends via publisher when event received
   - does NOT send when publisher fails (logs error)
   - uses correct channel from config

5. **`milestone-redis.cache.spec.ts`** (infrastructure)
   - read-through: loads from DB if cache empty
   - write-through: writes to both DB and Redis
   - TTL respected
   - handles Redis down (fallback to DB)

6. **`vip-message-formatter.adapter.spec.ts`** (formatter)
   - formatMilestoneMessage produces correct Markdown
   - handles missing ticker (UNKNOWN)
   - formats USD correctly (K/M/B)

## Final Design Notes

- **Backward compat**: existing PublishedCall records (without mcAtCall) won't be monitored. New VIP publishes will populate mcAtCall from input.
- **Performance**: DexScreener batch of 30 = ~1 HTTP call per tick for up to 30 active calls. For >30 calls, multiple ticks still finish in <5min.
- **Failure modes**:
  - DexScreener down → tick logs error, no notifications sent, next tick retries
  - Redis down → fallback to DB only (slower but correct)
  - Telegram send fails → logged, call is still recorded as notified (manual intervention)
  - DB down → in-memory mode kicks in (when DATABASE_ENABLED=false)