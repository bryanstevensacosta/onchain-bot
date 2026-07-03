# refactor-vip-calls-tables - Work Plan

## TL;DR (For humans)

**What you'll get:** Las tablas `published_calls` y `notified_achievements` se renombran a `vip_published_calls` y `vip_notified_achievements`. Se crea el sub-BC `vip-achievement/` bajo `telegram/vip-calls/` con estructura hexagonal completa (dominio, puertos, repositorios, módulo). La tabla de achievements ahora es dueña de `vip-achievement` y `token/achievement` se comunica vía event bus en lugar de escribir directamente.

**Why this approach:** La tabla de milestone notifications pertenece conceptualmente al BC que publica en el canal VIP, no al BC que evalúa las métricas. Usar event bridge mantiene el aislamiento entre BCs (cada BC es dueño de sus tablas) siguiendo las convenciones DDD del proyecto. El handler en `vip-achievement` hace el authoritative dedup, mientras `token/achievement` usa cache como optimización best-effort.

**What it will NOT do:** No cambia la lógica de negocio de milestone evaluation. No mueve MonitoredCall ni AchievementThreshold (se quedan en `token/achievement`). No refactoriza el pipeline de publicación de calls. No cambia nombres de módulos NestJS existentes (AchievementModule se queda, solo se le quita la responsabilidad de notified_achievements).

**Effort:** Large (2-3h)
**Risk:** Medium - migration de tablas en DB puede romper datos existentes si no se maneja con cuidado; requiere rollback plan.
**Decisions to sanity-check:** Que el handler en vip-achievement haga correctamente el dedup y que el cache en token/achievement siga funcionando como optimización.

**Your next move:** Approve this plan. Execution will be handled by the worker in 2 waves after approval.

---

> TL;DR (machine): Large effort, Medium risk. Rename published_calls→vip_published_calls, move notified_achievements to new vip-achievement BC under vip-calls/ with event bridge pattern.

## Scope
### Must have
1. Rename table `published_calls` → `vip_published_calls` (entity + migration)
2. Create `vip-achievement/` sub-BC with full hexagonal structure (domain entity, port, TypeORM entity, TypeORM repo, InMemory repo, module)
3. Move `notified_achievements` table ownership to `vip-achievement` (rename to `vip_notified_achievements`)
4. Enhance `AchievementReachedHandler` to be the authoritative owner (save + send + update)
5. Update `token/achievement` to use event bridge pattern (remove direct DB access)
6. Preserve ALL milestone notification history during migration

### Must NOT have (guardrails, anti-slop, scope boundaries)
- **NO** moving `MonitoredCall`, `AchievementThreshold`, evaluation logic, scheduling or cache logic to vip-achievement — esos se quedan en `token/achievement`
- **NO** changing the milestone evaluation algorithm or thresholds logic
- **NO** modifying the call publish pipeline (vip-channel/vip-calls-publish.use-case.ts)
- **NO** renaming NestJS modules (AchievementModule stays, VipCallsModule stays)
- **NO** dropping or truncating existing data — migrations must be `ALTER TABLE ... RENAME TO`
- **NO** touching bug-exploration.spec.ts files (they encode invariants)
- **NO** removing the cache dedup in `token/achievement` (it stays as best-effort optimization)

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: **tests-after-fix** — existing tests WILL break (they reference deleted imports). Each task that modifies code must also update the relevant spec, or mark which spec will be fixed in the test-update task (17).
- Evidence: Individual `npx tsc --noEmit` checks per task, plus `npm run test:backend` final pass
- DB: Execute migration script against dev DB with `docker exec -i alpha-meta-token-scanner-postgres psql -U alpha_meta_token_scanner -d alpha_meta_token_scanner < scripts/backfills/<date>-rename-vip-tables.sql` AFTER backing up data but BEFORE deploying new code. TypeORM `synchronize: true` will auto-detect the renamed table from the entity decorator — no CREATE TABLE needed.
- Migration order: (1) CREATE BACKUP of both tables, (2) run SQL migration to rename, (3) deploy code, (4) verify boot

## Execution strategy
### Parallel execution waves
- **Wave 1**: Create `vip-achievement/` sub-BC structure (todos 1-6) — independent file creations
- **Wave 2**: Enhance handler + simplify token/achievement + new InMemory spec (todos 7-11, 16) — depends on Wave 1
- **Wave 3**: Fix existing specs (todo 17) — depends on Wave 2
- **Wave 4**: Table renames + wiring updates + full test run (todos 12-15, 18) — depends on Waves 1-3 (12-13 are independent)

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1-6 (create vip-achievement) | — | 7-11, 14, 15 | — |
| 7 (enhance handler) | 1-6 | 8-11, 17 | — |
| 8-9 (simplify token/achievement) | 7 | 10-11, 17 | — |
| 10-11 (remove old files) | 8-9 | 14-15, 17 | — |
| 12-13 (rename tables) | — | 14-15 | 1-6 |
| 14-15 (wiring updates) | 10-13 | 18 | — |
| 16 (new InMemory spec) | 5 | 17 | 7-11 |
| 17 (fix existing specs) | 7-11, 16 | 18 | — |
| 18 (full test run) | 14-17 | — | — |

## Todos

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

### Wave 1: Create vip-achievement sub-BC

- [ ] 1. `vip-achievement/`: Create directory structure and domain entity
  **What to do / Must NOT do:**
  - Create directories: `telegram/vip-calls/vip-achievement/api/`, `application/handlers/`, `application/ports/`, `domain/entities/`, `domain/events/`, `infrastructure/persistence/typeorm/entities/`, `infrastructure/persistence/typeorm/repositories/`, `infrastructure/repositories/`, `infrastructure/messaging/`
  - Create `domain/entities/vip-achievement.entity.ts` — plain TS domain entity (extends Entity from shared/kernel)
    - Fields: id (string), callId (string), threshold (number), notifiedAt (Date), telegramMessageId (number | null)
    - Factory `create(props)` and `rehydrate(row)` static methods
    - DO NOT put `@Entity` decorator here
  - Test: NA (entity creation will be verified by compilation)
  **Parallelization:** Wave 1 | Blocked by: — | Blocks: 2, 3, 4, 5, 6
  **References:** `token/achievement/domain/entities/notified-achievement.entity.ts:16-52` (current combined entity for reference), `telegram/shared/domain/entities/published-call.entity.ts:55` (similar domain entity pattern)
  **Acceptance criteria:** `npx tsc --noEmit --project apps/backend/tsconfig.json` shows no errors
  **QA scenarios:** Compilation must succeed. Evidence: `.omo/evidence/task-1-compile.log`
  **Commit:** N (batched at end of wave)

- [ ] 2. `vip-achievement/`: Create application port (repository interface)
  **What to do / Must NOT do:**
  - Create `application/ports/vip-achievement.repository.ts`
  - Same interface as current `notified-achievement.repository.ts`:
    - `findByCall(callId: string): Promise<VipAchievementRecord[]>`
    - `findThresholdsForCall(callId: string): Promise<number[]>`
    - `existsByCallAndThreshold(callId: string, threshold: number): Promise<boolean>`
    - `save(record: VipAchievementRecord): Promise<VipAchievementRecord>`
    - `updateTelegramMessageId(callId: string, threshold: number, messageId: number): Promise<void>`
    - `countByCall(callId: string): Promise<number>`
  - Define `VipAchievementRecord` interface matching the domain fields
  - DO NOT include `callId` as optional — keep it typed exactly as current
  **Parallelization:** Wave 1 | Blocked by: 1 | Blocks: 4, 5
  **References:** `token/achievement/application/ports/notified-achievement.repository.ts:1-45` (port to replicate)
  **Acceptance criteria:** Compilation passes
  **QA scenarios:** Compile check. Evidence: `.omo/evidence/task-2-compile.log`
  **Commit:** N

- [ ] 3. `vip-achievement/`: Create TypeORM entity for `vip_notified_achievements` table
  **What to do / Must NOT do:**
  - Create `infrastructure/persistence/typeorm/entities/vip-achievement.entity.ts`
  - `@Entity({ name: 'vip_notified_achievements' })`
  - Columns:
    - `id` — `@PrimaryGeneratedColumn('uuid')`
    - `callId` — `@Column({ name: 'call_id', type: 'varchar' })` with `@Index('idx_vip_notified_achievements_call_id', ['callId'])`
    - `threshold` — `@Column({ name: 'threshold', type: 'float' })`
    - `notifiedAt` — `@Column({ name: 'notified_at', type: 'timestamptz' })`
    - `telegramMessageId` — `@Column({ name: 'telegram_message_id', type: 'bigint', nullable: true })`
  - `@Index('uq_vip_notified_achievements_call_threshold', ['callId', 'threshold'], { unique: true })` for dedup
  - **CRITICAL**: Index names MUST match the migration in task 13 exactly, otherwise `synchronize: true` in dev will DROP and recreate indexes (causing index lock + potential data issues)
  - DO NOT add domain logic (no create/rehydrate methods)
  **Parallelization:** Wave 1 | Blocked by: 1 | Blocks: 4, 5
  **References:** `token/achievement/domain/entities/notified-achievement.entity.ts:1-30` (current @Entity for reference on table shape), current table: `notified_achievements`
  **Acceptance criteria:** Compilation passes
  **QA scenarios:** Compile check. Evidence: `.omo/evidence/task-3-compile.log`
  **Commit:** N

- [ ] 4. `vip-achievement/`: Create TypeORM repository implementation
  **What to do / Must NOT do:**
  - Create `infrastructure/persistence/typeorm/repositories/typeorm-vip-achievement.repository.ts`
  - Extends `VipAchievementRepository` (the abstract port from todo 2)
  - Implements all methods: `findByCall`, `findThresholdsForCall`, `existsByCallAndThreshold`, `save`, `updateTelegramMessageId`, `countByCall`
  - Inject `@InjectRepository(VipAchievementEntity)` (typeorm entity from todo 3)
  - `save()` method: `this.repo.create({...})` + `this.repo.save(entity)` → map to record
  - `updateTelegramMessageId()`: raw `this.repo.update({ callId, threshold }, { telegramMessageId })` with `result.affected === 0` warning
  - DO NOT add any domain logic — this is pure persistence
  **Parallelization:** Wave 1 | Blocked by: 2, 3 | Blocks: 5, 6
  **References:** `token/achievement/infrastructure/persistence/typeorm/repositories/typeorm-notified-achievement.repository.ts:1-86` (full reference implementation)
  **Acceptance criteria:** Compilation passes
  **QA scenarios:** Compile check. Evidence: `.omo/evidence/task-4-compile.log`
  **Commit:** N

- [ ] 5. `vip-achievement/`: Create InMemory repository implementation
  **What to do / Must NOT do:**
  - Create `infrastructure/repositories/in-memory-vip-achievement.repository.ts`
  - Extends `VipAchievementRepository`
  - In-memory `Map<string, VipAchievementRecord[]>` keyed by callId
  - Implement all methods: findByCall, findThresholdsForCall, existsByCallAndThreshold, save, updateTelegramMessageId, countByCall
  - DO NOT add domain logic
  **Parallelization:** Wave 1 | Blocked by: 2 | Blocks: 6
  **References:** `token/achievement/infrastructure/repositories/in-memory-notified-achievement.repository.ts:1-63` (full reference)
  **Acceptance criteria:** Compilation passes
  **QA scenarios:** Compile check. Evidence: `.omo/evidence/task-5-compile.log`
  **Commit:** N

- [ ] 6. `vip-achievement/`: Create VipAchievementModule
  **What to do / Must NOT do:**
  - Create `vip-achievement/vip-achievement.module.ts`
  - Imports: `TypeOrmModule.forFeature([VipAchievementEntity])`
  - Providers:
    - `InProcessVipAchievementEventPublisher` (adapt existing `InProcessAchievementEventPublisher` pattern for the new BC)
    - `TypeormVipAchievementRepository` (or in-memory variant based on `isDatabaseEnabled()`)
    - Conditional provider for `VipAchievementRepository` abstract class (same pattern as vip-channel.module.ts)
    - **AchievementReachedHandler** ← MOVE THE HANDLER HERE, NOT in vip-channel.module.ts
  - Exports: `VipAchievementRepository`
  - DO NOT register any controllers
  **Parallelization:** Wave 1 | Blocked by: 4, 5 | Blocks: 7, 14
  **References:** `telegram/vip-calls/vip-channel/vip-channel.module.ts:31-78` (module wiring pattern), `token/achievement/achievement.module.ts:36-98` (provider pattern)
  **Acceptance criteria:** Compilation passes
  **QA scenarios:** `npx tsc --noEmit --project apps/backend/tsconfig.json > .omo/evidence/task-6-compile.log 2>&1`. Must exit 0.
  **Commit:** Y | `feat(vip-achievement): create vip-achievement sub-BC with entity, repos, and module`

### Wave 2: Enhance handler + simplify token/achievement

- [ ] 7. `vip-achievement/`: Enhance AchievementReachedHandler to own the save flow (with ON CONFLICT safety)
  **What to do / Must NOT do:**
  - This handler is now MOVED into `telegram/vip-calls/vip-achievement/vip-achievement.module.ts` providers (not in vip-channel.module.ts)
  - Change injected repo from `NotifiedAchievementRepository` (from token/achievement) to `VipAchievementRepository` (from vip-achievement)
  - Enhanced flow in `handle()`:
    1. **No `existsByCallAndThreshold` check** — use atomic INSERT with SAVEPOINT or upsert to handle race conditions
    2. **Save via `INSERT ON CONFLICT DO NOTHING`**: Call `this.repo.save()` which TypeORM wraps in an INSERT. If the unique constraint `(callId, threshold)` is violated, catch the error and check if row exists → skip (already notified by concurrent invocation). The TypeORM repository's `save()` method can accept an `upsert: true` option or catch the unique violation error.
       - Preferred approach: In the repo's `save()` method, use a raw-style reply: try INSERT; on duplicate unique constraint, treat as "already saved" and return null/undefined so the handler knows to skip sending.
       - DO NOT use existsByCallAndThreshold + save separately — that creates a TOCTOU race window.
    3. If save was successful → format milestone message, send to Telegram via publisher
    4. If send succeeds → `updateTelegramMessageId(callId, threshold, result.messageId)` (already done)
    5. If send fails → row is already saved, message not sent → next EventEmitter2 invocation will hit dedup and skip (message lost). This is acceptable for milestone notifications (best-effort, will catch up on next evaluation tick only for thresholds not yet notified)
  - Import from new vip-achievement paths, NOT from token/achievement
  - Update `@OnEvent` annotation — keep same event name `CallAchievementReachedEvent.EVENT_NAME`
  - Inject: `VipAchievementRepository`, `MessageFormatterPort` (via new formatter adapter), `TelegramPublisherPort`
  - DO NOT inject `NotifiedAchievementRepository` anymore
  - DO NOT remove the existing logging and error handling
  **Parallelization:** Wave 2 | Blocked by: 6 | Blocks: 8, 9, 10
  **References:** `telegram/vip-calls/vip-achievement/infrastructure/event-bus/achievement-reached.handler.ts:1-52` (current handler), `telegram/vip-calls/vip-channel/infrastructure/event-bus/token-approved-publish.handler.ts:1-110` (similar event handler pattern in vip-channel)
  **Acceptance criteria:** Compilation passes; handler logic verified; race condition mitigated via atomic save
  **QA scenarios:** `npx tsc --noEmit --project apps/backend/tsconfig.json > .omo/evidence/task-7-compile.log 2>&1`. Must exit 0.
  **Commit:** N

- [ ] 8. Simplify `RecordNotifiedAchievementUseCase` (remove DB dependency)
  **What to do / Must NOT do:**
  - Update `token/achievement/application/handlers/record-notified-achievement.use-case.ts`
  - **Remove** `NotifiedAchievementRepository` from constructor (no more DB writes)
  - **Keep** `AchievementCachePort` — cache update is still useful for early dedup in EvaluateActiveCallsUseCase
  - **Keep** `AchievementEventPublisher` and event emission (this is the event bridge!)
  - **Remove** the `existsByCallAndThreshold` check (authoritative dedup moved to handler)
  - **Remove** the `this.repo.save()` call
  - **Keep** the cache update (`this.cache.addNotifiedThreshold()`)
  - **Keep** the event emission with `CallAchievementReachedEvent`
  - Update import paths to remove `notified-achievement.repository` reference
  - DO NOT change the event payload structure
  - DO NOT remove the cache logic
  **Parallelization:** Wave 2 | Blocked by: 7 | Blocks: 9, 10
  **References:** `token/achievement/application/handlers/record-notified-achievement.use-case.ts:1-71` (full file)
  **Acceptance criteria:** Compilation passes; use case no longer imports NotifiedAchievementRepository
  **QA scenarios:** Compile check. Evidence: `.omo/evidence/task-8-compile.log`
  **Commit:** N

- [ ] 9. Simplify `EvaluateActiveCallsUseCase` (cache-only dedup)
  **What to do / Must NOT do:**
  - Update `token/achievement/application/handlers/evaluate-active-calls.use-case.ts`
  - **Remove** `NotifiedAchievementRepository` from constructor
  - **Keep** `AchievementCachePort` — it's the best-effort dedup
  - **Remove** `this.notifiedRepo.findThresholdsForCall()` call (line 76)
  - Change dedup to use cache-only: `const alreadyNotified = await this.cache.getNotifiedThresholds(call.callId);`
  - Remove the union with DB set: just use cache set
  - Update import paths
  - DO NOT change the evaluation loop structure
  - DO NOT change error handling in the loop
  **Parallelization:** Wave 2 | Blocked by: 7, 8 | Blocks: 10
  **References:** `token/achievement/application/handlers/evaluate-active-calls.use-case.ts:72-78` (dedup logic)
  **Acceptance criteria:** Compilation passes; evaluate no longer imports NotifiedAchievementRepository
  **QA scenarios:** Compile check. Evidence: `.omo/evidence/task-9-compile.log`
  **Commit:** N

- [ ] 10. Update `AchievementModule` (remove notified_achievements references)
  **What to do / Must NOT do:**
  - Update `token/achievement/achievement.module.ts`
  - **Remove** `NotifiedAchievementEntity` from `PERSISTED_ENTITIES`
  - **Remove** `TypeormNotifiedAchievementRepository` from imports and provider
  - **Remove** `InMemoryNotifiedAchievementRepository` from imports and provider
  - **Remove** the `NotifiedAchievementRepository` provider binding (line 85-88)
  - **Remove** `NotifiedAchievementRepository` from exports array
  - DO NOT touch AchievementThresholdEntity, MonitoredCallEntity, or their repos
  - DO NOT touch the cache, publisher, or settings providers
  **Parallelization:** Wave 2 | Blocked by: 8, 9 | Blocks: 11, 14, 15
  **References:** `token/achievement/achievement.module.ts:36-98`
  **Acceptance criteria:** Compilation passes; module no longer references NotifiedAchievementEntity or its repos
  **QA scenarios:** Compile check. Evidence: `.omo/evidence/task-10-compile.log`
  **Commit:** N

- [ ] 11. Delete old files in `token/achievement` for notified_achievements
  **What to do / Must NOT do:**
  - Delete file: `token/achievement/domain/entities/notified-achievement.entity.ts`
  - Delete file: `token/achievement/application/ports/notified-achievement.repository.ts`
  - Delete file: `token/achievement/infrastructure/persistence/typeorm/repositories/typeorm-notified-achievement.repository.ts`
  - Delete file: `token/achievement/infrastructure/repositories/in-memory-notified-achievement.repository.ts`
  - Delete file: `token/achievement/infrastructure/repositories/in-memory-notified-achievement.repository.spec.ts`
  - Update `token/achievement/application/ports/index-export.ts` — remove NotifiedAchievementRepository and NotifiedAchievementRecord exports
  - DO NOT touch spec files for RecordNotifiedAchievementUseCase or EvaluateActiveCallsUseCase (they need updates too)
  - DO NOT touch delete spec files that reference the deleted files' paths
  **Parallelization:** Wave 2 | Blocked by: 10 | Blocks: 14
  **References:** files listed above
  **Acceptance criteria:** Compilation passes; no broken imports remain
  **QA scenarios:** `npx tsc --noEmit --project apps/backend/tsconfig.json` must pass. Evidence: `.omo/evidence/task-11-compile.log`
  **Commit:** Y | `refactor(token/achievement): move notified_achievements ownership to vip-achievement via event bridge`

### Wave 3: Table renames + wiring updates

- [ ] 12. Rename `published_calls` → `vip_published_calls` in entity
  **What to do / Must NOT do:**
  - Update `telegram/vip-calls/vip-channel/infrastructure/persistence/typeorm/entities/published-call.entity.ts`
  - Change `@Entity({ name: 'published_calls' })` → `@Entity({ name: 'vip_published_calls' })`
  - Update the index decorator names if they reference the old table name (check if they do — the `@Index` decorators use short names like `idx_published_calls_status`, which are index names, not table names — they can stay)
  - DO NOT change any column names
  - DO NOT change any field names or types
  **Parallelization:** Wave 3 | Blocked by: — | Blocks: 14
  **References:** `telegram/vip-calls/vip-channel/infrastructure/persistence/typeorm/entities/published-call.entity.ts:9`
  **Acceptance criteria:** Compilation passes; entity decorator shows `vip_published_calls`
  **QA scenarios:** Compile check. Evidence: `.omo/evidence/task-12-compile.log`
  **Commit:** N

- [ ] 13. Create migration script to rename both tables
  **What to do / Must NOT do:**
  - Create `apps/backend/scripts/backfills/<date>-rename-vip-tables.sql`
  - Content:
    ```sql
    -- Rename published_calls → vip_published_calls
    ALTER TABLE IF EXISTS published_calls RENAME TO vip_published_calls;
    ALTER INDEX IF EXISTS published_calls_pkey RENAME TO vip_published_calls_pkey;
    ALTER INDEX IF EXISTS idx_published_calls_published_at RENAME TO idx_vip_published_calls_published_at;
    ALTER INDEX IF EXISTS idx_published_calls_status RENAME TO idx_vip_published_calls_status;
    ALTER INDEX IF EXISTS uq_published_calls_telegram_msg_id RENAME TO uq_vip_published_calls_telegram_msg_id;

    -- Rename notified_achievements → vip_notified_achievements
    ALTER TABLE IF EXISTS notified_achievements RENAME TO vip_notified_achievements;
    ALTER INDEX IF EXISTS PK_b0df8235c86fae048a69a93addc RENAME TO pk_vip_notified_achievements;
    ALTER INDEX IF EXISTS idx_notified_achievements_call_id RENAME TO idx_vip_notified_achievements_call_id;
    ALTER INDEX IF EXISTS uq_notified_achievements_call_threshold RENAME TO uq_vip_notified_achievements_call_threshold;
    ```
  - Also create rollback script: `<date>-rename-vip-tables-rollback.sql`
  - Must be idempotent (`IF EXISTS`)
  - DO NOT add data migration — no data changes
  - DO NOT use TypeORM migration system (use raw SQL for table renames)
  - **CRITICAL ORDERING**: The SQL migration MUST run BEFORE deploying the new code.
    - If new code boots first: `synchronize: true` creates empty `vip_notified_achievements` table AND `vip_published_calls` table while the old named tables still have data. Data is orphaned/lost.
    - Correct order: (1) Backup data, (2) Run SQL migration, (3) Deploy new code, (4) Verify boot
  - Add precondition check at top of migration: `SELECT to_regclass('notified_achievements')` and `SELECT to_regclass('published_calls')` — abort if either table is missing (prevents silent no-op)
  - Add verification SELECT after the rename: `SELECT COUNT(*) FROM vip_notified_achievements` and `SELECT COUNT(*) FROM vip_published_calls` — confirm data preserved
  **Parallelization:** Wave 3 | Blocked by: — | Blocks: 14
  **References:** `apps/backend/scripts/backfills/` (existing migration scripts for pattern: date-prefixed, idempotent, verification header)
  **Acceptance criteria:** SQL can be run against dev DB without errors; data is preserved
  **QA scenarios:** (1) `docker compose -f apps/backend/docker-compose.yml exec -T postgres psql -U alpha_meta_token_scanner -d alpha_meta_token_scanner < scripts/backfills/<date>-rename-vip-tables.sql` > `.omo/evidence/task-13-migration.log 2>&1`. (2) Verify row counts match pre-migration. (3) `\dt` shows `vip_published_calls` and `vip_notified_achievements`.
  **Commit:** N

- [ ] 14. Update `database.module.ts` entity paths
  **What to do / Must NOT do:**
  - Update `shared/common/persistence/database.module.ts`
  - **Remove** line 27: `import { NotifiedAchievementEntity } from 'token/achievement/domain/entities/notified-achievement.entity';`
  - **Add** import for the new Entity from vip-achievement: `import { VipAchievementEntity } from 'telegram/vip-calls/vip-achievement/infrastructure/persistence/typeorm/entities/vip-achievement.entity';`
  - **Remove** line 57: `NotifiedAchievementEntity,` from `PERSISTED_ENTITIES`
  - **Add** `VipAchievementEntity,` to `PERSISTED_ENTITIES`
  - Verify that `PublishedCallEntity` import is at line 28 and remains unchanged (entity is already there, just the table name changes via decorator which TypeORM handles at runtime)
  **Parallelization:** Wave 3 | Blocked by: 10, 11, 12, 13 | Blocks: 15
  **References:** `shared/common/persistence/database.module.ts:27,33-61`
  **Acceptance criteria:** Compilation passes
  **QA scenarios:** Compile check. Evidence: `.omo/evidence/task-14-compile.log`
  **Commit:** N

- [ ] 15. Update `vip-channel.module.ts` imports
  **What to do / Must NOT do:**
  - Update `telegram/vip-calls/vip-channel/vip-channel.module.ts`
  - **Remove** `AchievementModule` from `imports` array (line 38) — confirmed via grep that no other use case in this module references its exports. The only consumer was `AchievementReachedHandler` which used `NotifiedAchievementRepository`. Now the handler is in `VipAchievementModule` and uses `VipAchievementRepository`.
    - The `RegisterCallForAchievementsEvent` class import in `vip-calls-publish.use-case.ts` (line 16) is a TypeScript import, NOT a NestJS module import — it works independently. Do NOT remove that import.
  - **Remove** `AchievementReachedHandler` from `providers` array (line 49) — it's now provided by `VipAchievementModule`
  - **Add** `VipAchievementModule` to `imports` array (from `../vip-achievement/vip-achievement.module`)
  - DO NOT remove other imports (HttpModule, ChainRegistryModule, SettingsModule, etc.)
  - Verify that `app.module.ts` and `call-tracking.module.ts` still have `AchievementModule` import — they need it for `RegisterCallForAchievementsHandler` and `MonitoredCallRepository`/`AchievementThresholdRepository` which are NOT removed.
  **Parallelization:** Wave 3 | Blocked by: 11, 12, 13, 14 | Blocks: 16
  **References:** `telegram/vip-calls/vip-channel/vip-channel.module.ts:31-78`, `apps/backend/src/app.module.ts` (AchievementModule import), `token/call-tracking/call-tracking.module.ts` (AchievementModule import)
  **Acceptance criteria:** Compilation passes; `AchievementModule` removed from vip-channel.module.ts
  **QA scenarios:** `npx tsc --noEmit --project apps/backend/tsconfig.json > .omo/evidence/task-15-compile.log 2>&1`. Must exit 0.
  **Commit:** N

- [ ] 16. Create new spec: `InMemoryVipAchievementRepository`
  **What to do / Must NOT do:**
  - Create `telegram/vip-calls/vip-achievement/infrastructure/repositories/in-memory-vip-achievement.repository.spec.ts`
  - Mirror the 7 tests from the deleted `in-memory-notified-achievement.repository.spec.ts` (save, find, exists, dedup no-op on duplicate (callId, threshold))
  - CRITICAL: include the "save is a no-op for duplicate" test that proves the atomic dedup behavior
  **Parallelization:** Wave 3 | Blocked by: 5 | Blocks: 17
  **References:** `token/achievement/infrastructure/repositories/in-memory-notified-achievement.repository.spec.ts`
  **Acceptance criteria:** Spec compiles and passes
  **QA scenarios:** `cd apps/backend && npx jest --no-coverage telegram/vip-calls/vip-achievement/infrastructure/repositories/in-memory-vip-achievement.repository.spec.ts > .omo/evidence/task-16a-spec.log 2>&1`. Must exit 0.
  **Commit:** N

- [ ] 17. Fix all existing specs that reference deleted NotifiedAchievement files
  **What to do / Must NOT do:**
  - Fix ALL of the following spec files (not just 3 — there are at least 5):
    - `token/achievement/application/handlers/record-notified-achievement.use-case.spec.ts` — remove `FakeRepo` (extends `NotifiedAchievementRepository`), use `AchievementCachePort` mock only, assert no DB write, assert event still emitted
    - `token/achievement/application/handlers/evaluate-active-calls.use-case.spec.ts` — remove `FakeNotifiedRepo`, remove `NotifiedAchievementRepository` mock injection, update dedup assertions to cache-only
    - `token/achievement/application/handlers/evaluate-active-calls.use-case.dedup-integration.spec.ts` (336 lines) — this is the BIG one. Replace 7 `InMemoryNotifiedAchievementRepository` references with `AchievementCachePort` logic. The `merges cache + DB dedup sets correctly` test must be updated to "cache-only dedup"
    - `telegram/vip-calls/vip-achievement/infrastructure/event-bus/achievement-reached.handler.spec.ts` (if exists) or create one — test the new handler flow (save + send + update)
    - `token/achievement/infrastructure/repositories/in-memory-notified-achievement.repository.spec.ts` — DELETE this file (it's replaced by task 16's new spec)
  - DO NOT change the milestone evaluation function tests (`detect-crossed-achievements.service.spec.ts`)
  - DO NOT remove or modify bug-exploration spec files
  **Parallelization:** Wave 3 | Blocked by: 7, 8, 9, 10, 11, 16 | Blocks: 18
  **References:** All spec files listed above
  **Acceptance criteria:** `npx tsc --noEmit --project apps/backend/tsconfig.json` passes; all updated specs compile
  **QA scenarios:** `npx tsc --noEmit --project apps/backend/tsconfig.json > .omo/evidence/task-17-compile.log 2>&1`. Must exit 0.
  **Commit:** N

- [ ] 18. Run full backend test suite
  **What to do / Must NOT do:**
  - Run `cd apps/backend && npm run test` to execute all Jest tests
  - Fix any remaining failures from spec files that were missed
  - Verify all milestone-related tests still pass with identical assertions
  - Run: `cd apps/backend && npm run test:backend` (or `npm run test` at root)
  - DO NOT skip or disable failing tests
  **Parallelization:** Wave 3 | Blocked by: 15, 16, 17 | Blocks: —
  **References:** All spec files in the project
  **Acceptance criteria:** `npm run test:backend` passes with 0 failures
  **QA scenarios:** `npm run test:backend > .omo/evidence/task-18-tests.log 2>&1`. Must output "Tests: XXX passed, XXX total".
  **Commit:** Y | `fix: update tests for vip-achievement refactor`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. **Plan compliance audit** — Verify every todo completed, no scope creep
- [ ] F2. **Code quality review** — `npx tsc --noEmit --project apps/backend/tsconfig.json` = 0 errors; no `any` added; proper hexagonal structure
- [ ] F3. **DB migration verification** — Connect to dev DB: confirm `\dt vip_published_calls` and `\dt vip_notified_achievements` exist, data preserved (row count matches original tables)
- [ ] F4. **Scope fidelity** — Verify `MonitoredCall` and `AchievementThreshold` still in token/achievement; no deleted files left without migration

## Commit strategy
- Commit 1: `feat(vip-achievement): create vip-achievement sub-BC with entity, repos, and module` (todo 6)
- Commit 2: `refactor(token/achievement): move notified_achievements ownership to vip-achievement via event bridge` (todos 7-11)
- Commit 3: `fix: update tests for vip-achievement refactor` (todo 16)
- Squash all 3 into 1 commit before merging: `feat: migrate notified_achievements to vip-calls/vip-achievement BC and rename tables with vip_ prefix`

## Success criteria
1. `npm run test:backend` passes with 0 failures
2. `npx tsc --noEmit --project apps/backend/tsconfig.json` shows 0 errors
3. Dev DB has tables `vip_published_calls` and `vip_notified_achievements` with all data preserved
4. `token/achievement` no longer imports any `NotifiedAchievement*` symbols
5. `telegram/vip-calls/vip-achievement/` has full hexagonal structure with module, entity (domain + ORM), port, TypeORM repo, in-memory repo
6. Milestone notifications still appear in Telegram channel (functional parity)
