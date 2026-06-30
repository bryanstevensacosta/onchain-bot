---
slug: fix-settings-inmemory
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/fix-settings-inmemory.md
approach: Create InMemorySettingsFilterRepository to replace TypeORM Repository<SettingsFilterEntity> when DATABASE_ENABLED=false. Wire it conditionally in SettingsModule to match the IdentityModule pattern.
---

# Draft: fix-settings-inmemory

## Components (topology ledger)
1. `settings/infrastructure/persistence/in-memory/in-memory-settings-filter.repository.ts` — in-memory impl
2. `settings/settings.module.ts` — conditional provider wiring

## Findings (cited - path:lines)
1. **SettingsService** uses `@InjectRepository(SettingsFilterEntity)` → `filterRepo: Repository<SettingsFilterEntity>` (apps/backend/src/settings/application/services/settings.service.ts:60-66)
2. **SettingsModule** only registers TypeORM repos when `isDatabaseEnabled()` (apps/backend/src/settings/settings.module.ts:20-30)
3. When DB disabled, the `Repository<SettingsFilterEntity>` token is never registered → NestJS throws `UnknownDependenciesException`
4. Methods used on `filterRepo`:
   - `find({ where })` — used 7 times (lines 134, 287, 321, 339, 582, 585, 604)
   - `findOne({ where })` — used 1 time (line 619)
   - `create(dto)` — used 1 time (line 623)
   - `save(entity)` — used 1 time (line 631)
5. **IdentityModule** solves this correctly with a factory that picks TypeORM vs InMemoryKolRepository (apps/backend/src/kol/identity/identity.module.ts:46-62)
6. `SettingsService` is consumed by 20+ files across scoring, token-gating, call-tracking, vip-calls, kol-reputation BCs — high blast radius
7. The where-clause patterns used are simple exact-match on `type`, `value`, `enabled`, `scope` — no complex operators, joins, or relations

## Decisions (with rationale)
1. **Minimal in-memory repo** — not a full TypeORM Repository implementation, just the 4 methods actually used. Avoids implementing the full QueryBuilder interface.
2. **No refactor of SettingsService** — keep `@InjectRepository(SettingsFilterEntity)` and `Repository<SettingsFilterEntity>` type. Override the injection token at module level when DB is disabled. Zero changes to the 20+ consumers.
3. **Use `getRepositoryToken(SettingsFilterEntity)`** — NestJS convention for overriding TypeORM-generated tokens. When DB is disabled, we provide our own value for this token so `@InjectRepository` resolves to our in-memory class.

## Scope IN
- `InMemorySettingsFilterRepository` — in-memory class with `find`, `findOne`, `create`, `save`
- `SettingsModule` — conditional provider for `getRepositoryToken(SettingsFilterEntity)` when DB disabled
- Test: verify SettingsService boots without database

## Scope OUT (Must NOT have)
- No changes to SettingsService or any consumer
- No changes to other controllers
- No schema changes
- No new dependencies

## Approval gate
status: awaiting-approval
