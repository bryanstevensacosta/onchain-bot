# Draft: refactor-vip-calls-tables

## Intent
CLEAR — the user specified: move `notified_achievements` table from `token/achievement` to `telegram/vip-calls/vip-achievement`, rename tables with `vip_` prefix, create proper sub-BC structure.

## Decisions (user-approved)

### Table naming
- **Underscores**: `vip_published_calls` (was `published_calls`), `vip_notified_achievements` (was `notified_achievements`)
- Consistent with PostgreSQL idioms and TypeORM defaults

### Cross-BC dependency strategy
- **Event bridge**: `token/achievement` emits `CallAchievementReachedEvent`, `vip-achievement`'s handler saves to its own table + sends to Telegram
- `RecordNotifiedAchievementUseCase` simplified: removes DB repo dependency, keeps cache + event emission
- `EvaluateActiveCallsUseCase` uses cache-only for early dedup; the handler does authoritative dedup

### Domain vs ORM separation
- **Separate**: Create plain domain entity + separate TypeORM entity file
- Domain entity: `domain/entities/vip-achievement.entity.ts` (plain TS)
- ORM entity: `infrastructure/persistence/typeorm/entities/vip-achievement.entity.ts` (@Entity)

## Exploration findings

### Files to move/create
- `token/achievement/domain/entities/notified-achievement.entity.ts` → split into domain + ORM under `vip-achievement/`
- `token/achievement/application/ports/notified-achievement.repository.ts` → move to `vip-achievement/application/ports/`
- `token/achievement/infrastructure/persistence/typeorm/repositories/typeorm-notified-achievement.repository.ts` → move to `vip-achievement/infrastructure/persistence/typeorm/repositories/`
- `token/achievement/infrastructure/repositories/in-memory-notified-achievement.repository.ts` → move to `vip-achievement/infrastructure/repositories/`

### Files to update
- `token/achievement/application/handlers/record-notified-achievement.use-case.ts` — remove NotifiedAchievementRepository dependency
- `token/achievement/application/handlers/evaluate-active-calls.use-case.ts` — remove NotifiedAchievementRepository dependency, use cache-only
- `token/achievement/achievement.module.ts` — remove NotifiedAchievementEntity/repo from providers/exports
- `telegram/vip-calls/vip-achievement/infrastructure/event-bus/achievement-reached.handler.ts` — enhance to save + send + update
- `telegram/vip-calls/vip-channel/vip-channel.module.ts` — update imports
- `telegram/vip-calls/vip-channel/infrastructure/persistence/typeorm/entities/published-call.entity.ts` — rename table
- `shared/common/persistence/database.module.ts` — update entity paths
- All tests referencing moved code

### Key design decision: New module structure
- `vip-achievement/vip-achievement.module.ts` — standalone module registering its entity + repo
- Exports its repo port so DI can wire it into `AchievementReachedHandler`
- No cross-import needed into `token/achievement` (event bridge)

## Status
awaiting plan generation
