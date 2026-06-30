# fix-settings-inmemory - Work Plan

## TL;DR (For humans)

**What you'll get:** A fix so the backend starts correctly without a Postgres database (`DATABASE_ENABLED=false`). Right now `SettingsService` crashes NestJS because it requires a database table (`settings_filter`) that doesn't exist in in-memory mode. The fix adds a lightweight in-memory replacement so the service works either way.

**Why this approach:** Zero changes to the service or its 20+ consumers. Just provide an in-memory repo when the database is off — same pattern IdentityModule already uses for KolRepository.

**What it will NOT do:** No changes to SettingsService, no schema migrations, no database queries in in-memory mode.

**Effort:** Short
**Risk:** Low — single file addition + one module change, tests verify it boots

Your next move: review the plan below, then approve it.

---

> TL;DR (machine): Short effort, Low risk. Add InMemorySettingsFilterRepository, wire conditionally in SettingsModule.

## Scope
### Must have
- `InMemorySettingsFilterRepository` — class with internal Map, implements `find()`, `findOne()`, `create()`, `save()`
- `SettingsModule` — conditional provider override for `Repository<SettingsFilterEntity>` token via `getRepositoryToken`
- Existing SettingsService unchanged
- `npm run test:backend` passes (including existing SettingsService tests)

### Must NOT have
- No changes to SettingsService or to consumers
- No changes to controllers, DTOs, or other services
- No schema changes
- No new npm dependencies
- No refactoring of the file structure

## Verification strategy
- Test decision: tests-after
- Evidence: `.omo/evidence/task-1-inmemory-settings.txt`

## Execution strategy
### Parallel execution waves
- Wave 1: Single todo — create file + wire module

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |

## Todos
- [ ] 1. Create InMemorySettingsFilterRepository + wire in module
  What to do:
    1. Create `apps/backend/src/settings/infrastructure/persistence/in-memory/in-memory-settings-filter.repository.ts`
       - Store: `private readonly store = new Map<string, SettingsFilterEntity>()`
       - `async find(opts?: { where?: Record<string, unknown>; order?: Record<string, 'ASC' | 'DESC'> }): Promise<SettingsFilterEntity[]>` — filter store values where every key in `where` matches (exact equality). If `enabled` is in where, filter by it. Return array.
       - `async findOne(opts: { where: Record<string, unknown> }): Promise<SettingsFilterEntity | null>` — same filter, return first match or null
       - `create(dto: Partial<SettingsFilterEntity>): SettingsFilterEntity` — create a plain object (call `new SettingsFilterEntity()` and `Object.assign()`). Generate `id` with `crypto.randomUUID()` if not provided.
       - `async save(entity: SettingsFilterEntity): Promise<SettingsFilterEntity>` — store by `entity.id` (or a generated key), return entity
       - Import: `import { SettingsFilterEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-filter.entity';` and use plain `crypto` or `Math.random()` for UUID (whatever avoids additional imports).
    2. Modify `SettingsModule` (`apps/backend/src/settings/settings.module.ts`)
       - Add import: `import { getRepositoryToken } from '@nestjs/typeorm';`
       - Add import: `import { InMemorySettingsFilterRepository } from './infrastructure/persistence/in-memory/in-memory-settings-filter.repository';`
       - In the `providers` array, add a conditional entry after `SettingsService`:
         ```typescript
         ...(isDatabaseEnabled() ? [] : [
           {
             provide: getRepositoryToken(SettingsFilterEntity),
             useClass: InMemorySettingsFilterRepository,
           },
         ]),
         ```
    3. Run: `cd apps/backend && npx tsc --noEmit` — must pass.
    4. Run: `cd apps/backend && npm test -- --testPathPattern="settings" --silent 2>&1 | tail -30` — must pass.
       (If no settings tests exist, just the tsc check is sufficient, plus verify the NestJS error is gone by starting the app.)
    5. Commit: `feat(settings): add in-memory settings filter repository for db-less mode`

  Must NOT do:
    - Do NOT modify SettingsService, FiltersController, or any consumer
    - Do NOT implement `update`, `delete`, `count`, `query`, or any other TypeORM Repository method
    - Do NOT add new package

  References:
    - apps/backend/src/settings/application/services/settings.service.ts:60-66 (constructor with @InjectRepository)
    - apps/backend/src/settings/application/services/settings.service.ts:134 (find usage example)
    - apps/backend/src/settings/application/services/settings.service.ts:619-631 (findOne, create, save usage)
    - apps/backend/src/settings/settings.module.ts:18-42 (current module wiring)
    - apps/backend/src/kol/identity/identity.module.ts:46-62 (IdentityModule factory pattern for reference)
    - apps/backend/src/kol/identity/infrastructure/repositories/in-memory-kol.repository.ts (in-memory repo pattern)
    - apps/backend/src/settings/infrastructure/persistence/typeorm/entities/settings-filter.entity.ts (entity class)

  Acceptance criteria:
    - `npx tsc --noEmit` passes
    - `npm test -- --testPathPattern="settings"` passes
    - Backend boots with `DATABASE_ENABLED=false` without the SettingsService error

  QA scenarios:
    - Happy: backend starts without DB → SettingsService resolves, no error
    - Failure: `find` with no matches returns empty array
    - Evidence: `.omo/evidence/task-1-inmemory-settings.txt`

  Commit: Y | feat(settings): add in-memory settings filter repository for db-less mode

## Final verification wave
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Scope fidelity (no changes to SettingsService, controllers, etc.)
- [ ] F4. Manual QA: `npm run dev:backend` with DATABASE_ENABLED=false boots without SettingsService error

## Commit strategy
Single commit: `feat(settings): add in-memory settings filter repository for db-less mode`

## Success criteria
1. `InMemorySettingsFilterRepository` created with find, findOne, create, save
2. Module wired to provide it when `isDatabaseEnabled()=false`
3. tsc compiles
4. Existing tests pass
5. Backend starts without the `UnknownDependenciesException` on SettingsService
