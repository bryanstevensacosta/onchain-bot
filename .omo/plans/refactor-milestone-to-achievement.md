# refactor-milestone-to-achievement - Work Plan

## TL;DR (For humans)

**What you'll get:** "Milestone" renombrado a "achievement" y "token-gating" renombrado a "vip-call-approval". La carpeta `telegram/vip-calls-channel/` se reestructura en 4 sub-BCs: `shared/` (Bot API), `vip-decisions/` (orquestador approved/rejected), `vip-channel/` (publicación de calls), `vip-achievement/` (monitoreo de achievements). Todos los tokens obtienen un snapshot de mercado inmediatamente al ser ingeridos (no solo los aprobados). Los achievements se basan en ese snapshot de ingestion, y se guardan en BD con el `telegram_message_id` del post.

**Why this approach:** 7 waves secuenciales porque cada una depende de la anterior. La enrichment-on-extraction se dispara como evento paralelo no bloqueante. El rename de token-gating→vip-call-approval refleja su propósito real.

**What it will NOT do:** No renombrar `monitored_calls`, no tocar `milestonesHit` en call-tracking (es métrica de seguimiento), no modificar ingestion/chain-dexter-bot, no cambiar frontend, no alterar el formato de publicación de VIP calls.

**Effort:** XL — 7 waves, ~50+ archivos modificados
**Risk:** Medium — waves secuenciales; W1+W2 (rename foundation) son los más riesgosos
**Decisions to sanity-check:** Nombres de eventos (`achievement.register.call`, `achievement.call.reached`, `vip-call.approval.approved`), tablas DB (`achievement_thresholds`, `notified_achievements`, `vip_call_approval_decisions`)

Your next move: Approve this plan, then run `$start-work` to execute.

---

> TL;DR (machine): 7-wave refactor: (1) milestone→achievement, (2) token-gating→vip-call-approval, (3) vip-calls restructure, (4) vip-decisions orchestrator, (5) enrichment on extraction, (6) achievement baseline from snapshot, (7) telegram_message_id. XL effort, medium risk, 50+ files.

## Scope
### Must have
- Rename ALL `milestone` → `achievement` in `token/achievement/` (classes, files, events, DB tables, Redis keys, config, routes, tests)
- Rename ALL `token/token-gating` → `token/vip-call-approval/`:
  - Classes: `FiltersModule`→`VipCallApprovalModule`, `FiltersController`→`VipCallApprovalController`, `ApplyFiltersUseCase`→`ApplyVipCallApprovalUseCase`, `FilterDecision`→`VipCallApprovalDecision`, `FilterVerdict`→`VipCallApprovalVerdict`, `FilterReason`→`VipCallApprovalReason`, `FilterDecisionRepository`→`VipCallApprovalDecisionRepository`, `FiltersEventPublisher`→`VipCallApprovalEventPublisher`, `TokenFilteredEvent`→`VipCallApprovedEvent`, `TokenRejectedEvent`→`VipCallRejectedEvent`
  - Event names: `filters.token.approved`→`vip-call.approval.approved`, `filters.token.rejected`→`vip-call.approval.rejected`
  - DB table: `filter_decisions`→`vip_call_approval_decisions`
  - Controller route: `/token/token-gating`→`/token/vip-call-approval`
- Restructure `telegram/vip-calls/` into: `shared/` (Bot API), `vip-decisions/` (orchestrator), `vip-channel/` (call publishing), `vip-achievement/` (achievement publishing)
- Create `vip-decisions/` as orchestrator that receives `vip-call.approval.approved`/`vip-call.approval.rejected` and delegates
- Extract Bot API publisher port+adapter from `telegram/shared/` into `vip-calls/shared/`
- Create new handler `@OnEvent('extraction.candidates.extracted')` → calls `EnrichTokenUseCase.execute()` for each extracted CA
- Change `RegisterMonitoredCallUseCase` to get `mcAtCall` from enrichment snapshot
- Add `telegram_message_id` column to `NotifiedAchievementEntity`
- Update ALL external imports across the backend
- Full test suite passes after each wave

### Must NOT have (guardrails, anti-slop, scope boundaries)
- NOT rename `monitored_calls` table / `MonitoredCallEntity`
- NOT rename `milestonesHit` field in call-tracking
- NOT modify `telegram/ingestion/`, `telegram/chain-dexter-bot/`
- NOT remove existing normalization→enrichment event chain (coexistence)
- NOT change VIP call message format or channel configuration
- NOT rename existing `telegram/shared/` — keep for cross-telegram shared code
- NOT create circular dependencies (enrichment must NOT import from telegram/)
- vip-decisions must NOT directly import vip-channel or vip-achievement use cases

## Verification strategy
- Test decision: tests-after (run existing tests after each wave)
- Framework: Jest (`npm run test:backend`)
- Lint: `npm run lint:backend`
- Build: `npm run build`
- Evidence dir: `.omo/evidence/`

## Execution strategy
### Waves
- **Wave 1:** token/milestone → token/achievement (rename all)
- **Wave 2:** token/token-gating → token/vip-call-approval (rename all, frontend, dashboard, ws)
- **Wave 3:** Restructure telegram/vip-calls/ + extract BotApi to shared/
- **Wave 4:** Define VipCallPublishingPort + VipAchievementPublishingPort in shared/ (contracts only)
- **Wave 5:** Create vip-decisions orchestrator (uses ports from shared/, never concrete impls)
- **Wave 6:** Trigger enrichment on extraction for ALL tokens
- **Wave 7:** Change achievement mcAtCall from publish-time to enrichment snapshot
- **Wave 8:** Add telegram_message_id to NotifiedAchievementEntity

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1. milestone→achievement rename | — | 5, 7, 8 | — |
| 2. token-gating→vip-call-approval | — | 5 | — |
| 3. vip-calls restructure | — | 4, 5 | 1, 2 |
| 4. Define ports in shared/ | 3 | 5 | — |
| 5. vip-decisions orchestrator | 1, 2, 4 | — | — |
| 6. Early enrichment on extraction | — | 7 | 1, 2, 3 |
| 7. Achievement baseline from snapshot | 1, 6 | 8 | — |
| 8. telegram_message_id in achievements | 1, 7 | — | — |

## Todos

### Wave 1 — token/milestone → token/achievement

- [ ] 1. Git-move token/milestone → token/achievement + rename all classes/files
  What to do / Must NOT do:
  1. `git mv apps/backend/src/token/milestone apps/backend/src/token/achievement`
  2. Rename every file containing "milestone" → "achievement" (git mv each file)
  3. Rename ALL class names: `MilestoneModule`→`AchievementModule`, `MilestoneThresholdEntity`→`AchievementThresholdEntity`, `NotifiedMilestoneEntity`→`NotifiedAchievementEntity`, `MilestoneMultiple`→`AchievementMultiple`, `MilestoneThresholdRepository`→`AchievementThresholdRepository`, `MilestoneCachePort`→`AchievementCachePort`, `MilestoneEventPublisher`→`AchievementEventPublisher`, `MilestoneSettingsPort`→`AchievementSettingsPort`, `LiveMilestoneScheduler`→`LiveAchievementScheduler`, `RegisterCallForMilestonesHandler`→`RegisterCallForAchievementsHandler`, `RecordNotifiedMilestoneUseCase`→`RecordNotifiedAchievementUseCase`, `DetectCrossedMilestonesService`→`DetectCrossedThresholdsService`, `RedisMilestoneCacheAdapter`→`RedisAchievementCacheAdapter`, `InMemoryMilestoneCacheAdapter`→`InMemoryAchievementCacheAdapter`, `SettingsMilestoneSettingsAdapter`→`SettingsAchievementSettingsAdapter`, `InProcessMilestoneEventPublisher`→`InProcessAchievementEventPublisher`, `DefaultThresholdsSeedService`→`DefaultThresholdsSeedService` (no rename needed), `InMemoryMilestoneThresholdRepository`→`InMemoryAchievementThresholdRepository`, `TypeormMilestoneThresholdRepository`→`TypeormAchievementThresholdRepository`, `TypeormNotifiedMilestoneRepository`→`TypeormNotifiedAchievementRepository`, `InMemoryNotifiedMilestoneRepository`→`InMemoryNotifiedAchievementRepository`
  4. Rename DB table names in @Entity: `milestone_thresholds`→`achievement_thresholds`, `notified_milestones`→`notified_achievements`. `monitored_calls` unchanged.
  5. Rename Redis key prefix from `milestone:notified:` to `achievement:notified:`
  6. Rename event names: `milestone.register.call`→`achievement.register.call`, `milestone.call.reached`→`achievement.call.reached`
  7. Rename controller route from `/milestones` to `/achievements`
  8. Rename import paths inside achievement/ files to match new file names
  9. NOT rename: MonitoredCallEntity, MonitoredCallRepository, LiveMarketDataPort, `monitored-call.entity.ts`, `monitored-call.repository.ts`, `live-market-data.port.ts`, `milestonesHit` field in call-tracking
  10. NOT rename config section key `app.milestone.*` — config struct shape stays
  11. Run `npm run build && npm run test:backend` to verify
  Must NOT: rename MonitoredCallEntity, `milestonesHit` field, config section keys.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 4, 6, 7
  References: `apps/backend/src/token/milestone/` (all 34 files)
  Acceptance criteria: `grep -r "milestone" apps/backend/src/token/achievement/ --include="*.ts" | grep -v "node_modules" | grep -v "milestonesHit"` returns 0. `npm run build` exits 0.
  QA scenarios: build test + test suite.
  Commit: Y | `refactor(token): rename milestone→achievement in token/achievement/ module`

- [ ] 2. Update ALL external imports referencing milestone
  What to do / Must NOT do: Update every file outside `token/achievement/`:
  - `app.module.ts` — `MilestoneModule` → `AchievementModule`, path to `token/achievement/achievement.module`
  - `database.module.ts:25-27` — update 3 entity imports paths + rename `NotifiedMilestoneEntity`→`NotifiedAchievementEntity`
  - `call-tracking/call-tracking.module.ts` — `MilestoneModule`→`AchievementModule`, path update
  - `call-tracking/` — 10+ files importing from `token/milestone/application/ports/*` → `token/achievement/application/ports/*`
  - `telegram/vip-calls-channel/` — 3 milestone references (will be temporarily updated; Wave 3 restructures these)
  - Run `npm run build && npm run test:backend`
  Must NOT: rename `milestonesHit` in call-tracking domain entity.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4
  References: grep results — 26 external files reference milestone
  Acceptance criteria: `grep -r "from 'token/milestone" apps/backend/src/ --include="*.ts"` returns 0. `npm run build` succeeds.
  QA scenarios: build test + full test suite.
  Commit: Y | `refactor(core): update external imports from token/milestone to token/achievement`

### Wave 2 — token/token-gating → token/vip-call-approval

- [ ] 3. Git-move token/token-gating → token/vip-call-approval + rename ALL
  What to do / Must NOT do:
  1. `git mv apps/backend/src/token/token-gating apps/backend/src/token/vip-call-approval`
  2. Rename every file: `filter-decision.*` → `vip-call-approval-decision.*`, `token-filtered.event.*` → `vip-call-approved.event.*`, `token-rejected.event.*` → `vip-call-rejected.event.*`, `filters-event.publisher.*` → `vip-call-approval-event.publisher.*`, `filters.controller.*` → `vip-call-approval.controller.*`, `filters.module.*` → `vip-call-approval.module.*`, etc.
  3. Rename ALL class names (source AND spec files):
     - `FiltersModule`→`VipCallApprovalModule`
     - `FiltersController`→`VipCallApprovalController`
     - `ApplyFiltersUseCase`→`ApplyVipCallApprovalUseCase`
     - `FilterDecision`→`VipCallApprovalDecision`
     - `FilterVerdict`→`VipCallApprovalVerdict`
     - `FilterReason`→`VipCallApprovalReason`
     - `FilterDecisionRepository`→`VipCallApprovalDecisionRepository`
     - `FiltersEventPublisher`→`VipCallApprovalEventPublisher`
     - `FilterDecisionView`→`VipCallApprovalDecisionView`
     - `TokenFilteredEvent`→`VipCallApprovedEvent`
     - `TokenRejectedEvent`→`VipCallRejectedEvent`
     - `TokenScoredHandler`→`VipCallScoreHandler`
     - `InMemoryFilterDecisionRepository`→`InMemoryVipCallApprovalDecisionRepository`
     - `TypeOrmFilterDecisionRepository`→`TypeOrmVipCallApprovalDecisionRepository`
     - `InProcessFiltersEventPublisher`→`InProcessVipCallApprovalEventPublisher`
     - `FilterDecisionEntity`→`VipCallApprovalDecisionEntity`
     - `FilterDecisionMapper`→`VipCallApprovalDecisionMapper`
     - `FilterListKind`→`VipCallApprovalListKind`
     - `GetFilterDecisionUseCase`→`GetVipCallApprovalDecisionUseCase`
     - `ListFilterDecisionsUseCase`→`ListVipCallApprovalDecisionsUseCase`
     - `ReprocessRejectedTokenUseCase`→`ReprocessVipCallUseCase`
     - `VerifyRejectedTokenUseCase`→`VerifyVipCallRejectionUseCase`
     - `BlacklistPort`→`VipCallBlacklistPort`
     - `InMemoryBlacklistAdapter`→`InMemoryVipCallBlacklistAdapter`
  4. Rename event names in domain events: `filters.token.approved`→`vip-call.approval.approved`, `filters.token.rejected`→`vip-call.approval.rejected`
  5. Rename DB table: `filter_decisions`→`vip_call_approval_decisions` in @Entity decorator
  6. Rename controller route: `/token/token-gating`→`/token/vip-call-approval`
  7. Update all import paths inside the module (source + specs)
  8. Update ALL external imports (source + specs):
     - `app.module.ts` — `FiltersModule`→`VipCallApprovalModule`, path update
     - `dashboard/dashboard.module.ts` — same
     - `dashboard/application/services/refresh-kpis.service.ts` — event names `filters.token.approved`→`vip-call.approval.approved`, `filters.token.rejected`→`vip-call.approval.rejected`
     - `database.module.ts` — update entity import path
     - `shared/ws/gateway/ws.gateway.ts:53-54` — update event name strings
     - `telegram/vip-calls-channel/` — update imports + event name references (including .spec.ts files)
     - Frontend `apps/frontend/src/shared/api/endpoints.ts` — update `/token/token-gating/` → `/token/vip-call-approval/`
     - Frontend `apps/frontend/src/entities/filter-decision/api/decision-queries.ts` — update paths
     - All test files referencing old names
  9. Run DB migration: `ALTER TABLE filter_decisions RENAME TO vip_call_approval_decisions;` (production)
  10. Run `npm run build && npm run test:backend && npm run test:frontend`
  Must NOT: change the gate logic or config structure (only rename).
  Parallelization: Wave 2 | Blocked by: — | Blocks: 5
  References: `apps/backend/src/token/token-gating/` (entire module), `apps/frontend/src/shared/api/endpoints.ts`, `apps/frontend/src/entities/filter-decision/api/`
  Acceptance criteria: `grep -r "token-gating\|filters\.token\.\|FilterDecision\b\|FiltersModule\|TokenFilteredEvent" apps/backend/src/ --include="*.ts" | grep -v "vip-call-approval\|VipCallApproval"` returns 0. `npm run build` succeeds. Frontend compiles.
  QA scenarios: build + full test suite + frontend test.
  Commit: Y | `refactor(token): rename token/token-gating to token/vip-call-approval`

### Wave 3 — Restructure telegram/vip-calls/

- [ ] 4. Create vip-calls directory structure with 4 sub-BCs
  What to do / Must NOT do:
  1. `git mv apps/backend/src/telegram/vip-calls-channel apps/backend/src/telegram/vip-calls`
  2. Inside `telegram/vip-calls/`, create: `mkdir -p shared application/ports domain/ports infrastructure/senders`
  3. Create: `mkdir -p vip-decisions/infrastructure/event-bus`
  4. `mkdir -p vip-channel/{api/http,application/handlers,infrastructure/{persistence/typeorm/entities,persistence/typeorm/repositories,formatters,event-bus,repositories,senders}}`
  5. `mkdir -p vip-achievement/{infrastructure/event-bus,infrastructure/formatters}`
  6. Move files from old flat structure into respective subdirs:
     - `vip-calls/vip-calls.module.ts` → `vip-calls/vip-channel/vip-channel.module.ts`
     - `vip-calls/api/` → `vip-calls/vip-channel/api/`
     - `vip-calls/application/` → `vip-calls/vip-channel/application/`
     - `vip-calls/infrastructure/persistence/` → `vip-calls/vip-channel/infrastructure/persistence/`
     - `vip-calls/infrastructure/repositories/` → `vip-calls/vip-channel/infrastructure/repositories/`
     - `vip-calls/infrastructure/formatters/` → `vip-calls/vip-channel/infrastructure/formatters/`
     - `vip-calls/infrastructure/event-bus/token-approved-publish.handler.ts` (update event to `vip-call.approval.approved`) → `vip-calls/vip-decisions/infrastructure/event-bus/`
     - `vip-calls/infrastructure/event-bus/milestone-reached.handler.ts` → `vip-calls/vip-achievement/infrastructure/event-bus/achievement-reached.handler.ts` (renamed + update event to `achievement.call.reached`)
     - `vip-calls/infrastructure/senders/bot-api-telegram-publisher.adapter.ts` → `vip-calls/shared/infrastructure/senders/bot-api-telegram-publisher.adapter.ts`
  7. Delete empty old `vip-calls/infrastructure/event-bus/` (handlers moved)
  8. Create `vip-calls/shared/index.ts` exporting shared symbols
  9. Update `telegram/index.ts` export path
  10. Update all relative imports inside moved files
  11. Run `npm run build` (may fail — imports updated in next todo)
  Must NOT: delete `telegram/shared/` — keep for cross-telegram shared code.
  Parallelization: Wave 3 | Blocked by: — | Blocks: 4
  References: `apps/backend/src/telegram/vip-calls-channel/`
  Acceptance criteria: `ls apps/backend/src/telegram/vip-calls/` shows `shared/ vip-decisions/ vip-channel/ vip-achievement/`.
  QA scenarios: `git status` shows all moves.
  Commit: Y | `refactor(telegram): create vip-calls structure with shared/vip-decisions/vip-channel/vip-achievement`

- [ ] 5. Update ALL external imports for new vip-calls structure
  What to do / Must NOT do:
  - `app.module.ts` — update import path to `telegram/vip-calls/vip-channel/vip-channel.module`
  - `dashboard/dashboard.module.ts` — same path update
  - `database.module.ts:28` — `PublishedCallEntity` import path update
  - `telegram/index.ts` — export from `./vip-calls/vip-channel/vip-channel.module`
  - `call-tracking/call-tracking.module.ts` — update import path
  - Create new `vip-achievement/achievement-publishing.module.ts` NestJS module
  - Wire new module in `AppModule`
  - Run `npm run build && npm run test:backend`
  Must NOT: change public API exports from telegram/index.ts.
  Parallelization: Wave 3 | Blocked by: 4 | Blocks: —
  References: 5 files reference old path
  Acceptance criteria: `grep -r "vip-calls-channel" apps/backend/src/ --include="*.ts"` returns 0. `npm run build` succeeds.
  QA scenarios: build test + full test suite.
  Commit: Y | `refactor(telegram): update imports for new vip-calls structure`

### Wave 4 — Define decoupling ports in vip-calls/shared/

- [ ] 6. Create VipCallPublishingPort + VipAchievementPublishingPort in shared/
  What to do / Must NOT do:
  1. Create `telegram/vip-calls/shared/application/ports/vip-call-publishing.port.ts`:
     ```typescript
     export abstract class VipCallPublishingPort {
       abstract publish(input: VipCallsPublishInput): Promise<VipCallsPublishOutput>;
     }
     ```
     (Use existing VipCallsPublishInput/Output types or define new ones in shared/)
  2. Create `telegram/vip-calls/shared/application/ports/vip-achievement-publishing.port.ts`:
     ```typescript
     export abstract class VipAchievementPublishingPort {
       abstract publishAchievement(event: CallAchievementReachedEvent): Promise<{ messageId?: number }>;
     }
     ```
  3. Extract `BotApiTelegramPublisherAdapter` from `telegram/shared/` → `vip-calls/shared/infrastructure/senders/`
     - Keep backward-compatible export from `telegram/shared/` via re-export
  4. Create `vip-calls/shared/shared.module.ts` — NestJS module that:
     - Provides BotApiTelegramPublisherAdapter
     - Declares the ports (abstract classes — no implementation here)
     - Exports everything
  5. Update `vip-channel/vip-channel.module.ts` to:
     - Import `VipCallsSharedModule`
     - Implement `VipCallPublishingPort` via `VipCallsPublishUseCase`
     - Register the implementation: `{ provide: VipCallPublishingPort, useClass: VipCallsPublishUseCase }`
  6. Update `vip-achievement/achievement-publishing.module.ts` to:
     - Import `VipCallsSharedModule`
     - Implement `VipAchievementPublishingPort`
     - Register the implementation
  7. Run `npm run build` to verify
  Must NOT: put implementation logic in shared/ — only abstract ports. vip-channel and vip-achievement implement the ports.
  Parallelization: Wave 4 | Blocked by: 3 | Blocks: 5
  References: `apps/backend/src/telegram/shared/`, `apps/backend/src/telegram/vip-calls-channel/infrastructure/senders/bot-api-telegram-publisher.adapter.ts`
  Acceptance criteria: `vip-calls/shared/application/ports/` contains both abstract port classes. `vip-calls/shared/infrastructure/senders/` has BotApiTelegramPublisherAdapter. `npm run build` succeeds.
  QA scenarios: build test.
  Commit: Y | `feat(telegram): define VipCallPublishingPort and VipAchievementPublishingPort in vip-calls/shared/`

### Wave 5 — Create vip-decisions orchestrator (decoupled via ports)

- [ ] 7. Create vip-decisions orchestrator module (zero coupling to vip-channel/vip-achievement)
  What to do / Must NOT do:
  1. Create `telegram/vip-calls/vip-decisions/decisions.module.ts` with:
     - `VipCallApprovedHandler` — listens to `vip-call.approval.approved`
     - `VipCallRejectedHandler` — listens to `vip-call.approval.rejected`
     - Import ONLY from `vip-calls/shared/` (ports) + `token/achievement/` (RegisterMonitoredCallUseCase)
     - **Do NOT import from vip-channel.** Inject `VipCallPublishingPort` (the abstract port from shared/)
  2. `VipCallApprovedHandler`:
     - `@OnEvent('vip-call.approval.approved')`
     - Calls `VipCallPublishingPort.publish(data)` — delegates to vip-channel via port
     - Calls `RegisterMonitoredCallUseCase.execute({ chain, address })` — achievement registration
  3. `VipCallRejectedHandler`:
     - `@OnEvent('vip-call.approval.rejected')`
     - Logs rejected tokens with reasons
  4. Wire `DecisionsModule` in `AppModule`
  5. Ensure DI wiring: `AppModule` provides `VipCallPublishingPort` with implementation from `VipCallsSharedModule`
  6. Remove old handler registration from `vip-channel/vip-channel.module.ts`
  7. Run `npm run build && npm run test:backend`
  Must NOT: import vip-channel use case directly. Use VipCallPublishingPort only. Must NOT duplicate event consumption.
  Parallelization: Wave 5 | Blocked by: 1, 2, 4 | Blocks: —
  References: `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/token-approved-publish.handler.ts`, new ports from Wave 4
  Acceptance criteria: `grep -r "import.*vip-channel\|import.*VipCallsPublishUseCase" apps/backend/src/telegram/vip-calls/vip-decisions/` returns 0. `@OnEvent('vip-call.approval.approved')` exists. `npm run build` succeeds.
  QA scenarios: build test + test suite.
  Commit: Y | `feat(telegram): create vip-decisions orchestrator decoupled via VipCallPublishingPort`

### Wave 6 — Early enrichment on extraction for ALL tokens

- [ ] 8. Trigger EnrichTokenUseCase on extraction for every extracted CA
  What to do / Must NOT do:
  1. Create `token/intake/extraction/infrastructure/event-bus/enrich-on-extraction.handler.ts`:
     - `@OnEvent('extraction.candidates.extracted', { async: true })`
     - For each extracted contract address with chain hint, call `EnrichTokenUseCase.execute({ chain, address })`
     - Fire-and-forget with try/catch — enrichment failure must NOT block the pipeline
  2. Register handler in `extraction.module.ts`
  3. Import `EnrichmentModule` in `ExtractionModule` (or use shared event bus)
  4. Run `npm run build && npm run test:backend`
  Must NOT: block the main pipeline. NOT remove existing normalization→enrichment path.
  Parallelization: Wave 5 | Blocked by: — | Blocks: 6
  References: `apps/backend/src/token/intake/extraction/`, `apps/backend/src/token/enrichment/application/handlers/enrich-token.use-case.ts:52`
  Acceptance criteria: When `extraction.candidates.extracted` fires, EnrichTokenUseCase.execute is called for each CA.
  QA scenarios: Unit test: mock extraction event → verify enrichment called. Integration: verify token_snapshots exist for tokens that never passed normalization.
  Commit: Y | `feat(token): trigger enrichment on extraction for all ingested tokens`

### Wave 7 — Achievement mcAtCall from enrichment snapshot

- [ ] 9. Change achievement mcAtCall baseline from publish-time to enrichment snapshot
  What to do / Must NOT do:
  1. Update `token/achievement/application/handlers/register-monitored-call-for-achievements.use-case.ts`:
     - Accept `chain` + `address` as input (remove `mcAtCall` from required input)
     - Inside execute: call `TokenSnapshotRepository.findByChainAndAddress(chain, address)` to get `marketCapUsd`
     - Use snapshot's `marketCapUsd` as `mcAtCall`
     - Fallback: if snapshot has no `marketCapUsd`, accept optional `mcAtCall` in input
  2. Update `RegisterCallForAchievementsEvent` payload to remove `mcAtCall`
  3. Update `RegisterCallForAchievementsHandler` accordingly
  4. Update `VipCallsPublishUseCase` (in vip-decisions) to NOT pass `mcAtCall` in the event
  5. Inject `TokenSnapshotRepository` into the use case
  6. Run `npm run build && npm run test:backend`
  Must NOT: depend on publish-time data for achievement baseline.
  Parallelization: Wave 6 | Blocked by: 1, 5 | Blocks: 7
  References: `token/achievement/application/handlers/register-monitored-call.use-case.ts`, `token/enrichment/application/ports/token-snapshot.repository.ts`
  Acceptance criteria: Achievement detection uses marketCapUsd from enrichment snapshot. If no snapshot, falls back to publish-time mcAtCall.
  QA scenarios: Mock snapshot with marketCapUsd=1000 → verify MonitoredCallRecord has mcAtCall=1000.
  Commit: Y | `feat(token): achievement mcAtCall baseline from enrichment snapshot`

### Wave 8 — Add telegram_message_id to NotifiedAchievementEntity

- [ ] 10. Add telegram_message_id column + persist from AchievementReachedHandler
  What to do / Must NOT do:
  1. Add column to `token/achievement/domain/entities/notified-achievement.entity.ts`:
     ```
     @Column({ name: 'telegram_message_id', type: 'bigint', nullable: true })
     public telegramMessageId!: number | null;
     ```
  2. Update `NotifiedAchievementRecord` interface — add `telegramMessageId?: number | null`
  3. Update `InMemoryNotifiedAchievementRepository` to store/retrieve the field
  4. Update `TypeormNotifiedAchievementRepository` save/find to map the field
  5. Update `RecordNotifiedAchievementUseCase` input to accept optional `telegramMessageId`
  6. Update `AchievementReachedHandler` (vip-achievement):
     - After `this.publisher.sendMessage()`, get `result.messageId`
     - Pass `telegramMessageId` back through `RecordNotifiedAchievementUseCase`
     - Split flow: (a) RecordNotifiedAchievementUseCase records the achievement, (b) handler publishes to Telegram, (c) handler updates record with messageId via `updateTelegramMessageId(callId, threshold, messageId)`
  7. Run `npm run build && npm run test:backend`
  Must NOT: make telegramMessageId required (null for historical records).
  Parallelization: Wave 7 | Blocked by: 1, 6 | Blocks: —
  References: `apps/backend/src/token/achievement/domain/entities/notified-achievement.entity.ts`, `apps/backend/src/telegram/vip-calls/vip-achievement/infrastructure/event-bus/achievement-reached.handler.ts`
  Acceptance criteria: `NotifiedAchievementEntity` has telegramMessageId column. After publishing, record has message_id populated.
  QA scenarios: Mock publisher returning messageId=12345 → verify repository record has telegramMessageId=12345.
  Commit: Y | `feat(token): add telegram_message_id to notified_achievements entity and persist from handler`

## Final verification wave
- [ ] F1. Plan compliance audit — verify ALL milestones renamed, ALL token-gating→vip-call-approval renamed, ALL vip-calls restructured, enrichment-on-extraction handler exists, achievement baseline from snapshot, telegram_message_id column added
- [ ] F2. Code quality review — no dead imports, no old strings, no duplicate event handlers
- [ ] F3. Full test suite — `npm run test:backend` passes, `npm run build` succeeds
- [ ] F4. Scope fidelity — confirm monitored_calls untouched, milestonesHit field untouched, telegram/ingestion/ and chain-dexter-bot/ untouched

## Commit strategy
- 10 commits following the wave structure
- Conventional commit format: `type(scope): message`
- Each commit must leave the tree in a buildable state

## Success criteria
- `grep -r "milestone" apps/backend/src/token/achievement/ --include="*.ts" | grep -v "milestonesHit"` — 0 hits
- `grep -r "token-gating\|filters.token\|FilterDecision\b\|FiltersModule\|TokenFilteredEvent" apps/backend/src/ --include="*.ts" | grep -v "vip-call-approval\|VipCallApproval"` — 0 hits
- `grep -r "vip-calls-channel" apps/backend/src/ --include="*.ts"` — 0 hits
- `grep -r "from 'token/milestone" apps/backend/src/ --include="*.ts"` — 0 hits
- `grep -r "from 'token/token-gating" apps/backend/src/ --include="*.ts"` — 0 hits
- `grep -r "from 'telegram/vip-calls-channel" apps/backend/src/ --include="*.ts"` — 0 hits
- `ls apps/backend/src/telegram/vip-calls/` shows `shared/ vip-decisions/ vip-channel/ vip-achievement/`
- `npm run build` — exits 0
- `npm run test:backend` — all passing
- `NotifiedAchievementEntity` has `telegramMessageId` column
- Enrichment handler exists: `grep -r "extraction.candidates.extracted" apps/backend/src/ --include="*.ts"` matches in extraction module
- Frontend updated if API routes changed
