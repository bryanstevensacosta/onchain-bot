# fix-crypto-news-message-entity - Work Plan

## TL;DR (For humans)

**What you'll get:** The "/crypto-news" page stops showing error 500. `CryptoNewsMessageEntity` gets registered in TypeORM, the repository can read from the database, and the news page shows real data instead of a crash.

**Why this approach:** It's the same fix we already applied for CryptoNewsSourceEntity (commit de49c83) — one import + one line in the entities array. The deploy pipeline (scripts/deploy.sh + correct script_path in workflow) is already working, so commit+push = auto-deploy to prod.

**What it will NOT do:** No changes to the entity, repository, or any other file. No architecture changes. No need to redeploy manually.

**Effort:** Trivial
**Risk:** None — exact same pattern as de49c83

---

> TL;DR (machine): Trivial effort, Zero risk. 1 import + 1 array entry in database.module.ts. Commit + push → auto-deploy.

## Scope
### Must have
- Import `CryptoNewsMessageEntity` in `database.module.ts`
- Add to `PERSISTED_ENTITIES` array
- tsc --noEmit clean
- jest clean
- Dev server boot: `/crypto-news/messages?limit=50` returns 200 instead of 500

### Must NOT have
- No changes to entity, repository, or any other module
- No architecture changes
- No manual deploy

## Todos
- [ ] 1. Register CryptoNewsMessageEntity in TypeORM
  What to do:
    1. Read `apps/backend/src/shared/common/persistence/database.module.ts`
    2. Add import: `import { CryptoNewsMessageEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';`
    3. Add `CryptoNewsMessageEntity` to the `PERSISTED_ENTITIES` array (place it after `CryptoNewsSourceEntity` for logical grouping)
    4. Run `cd apps/backend && npx tsc --noEmit` — 0 errors
    5. Run `cd apps/backend && npx jest --silent` — pass (5 pre-existing failures OK)
    6. Start dev server and verify: `curl -s http://localhost:3030/crypto-news/messages?limit=50` returns HTTP 200 (not 500)
    7. Kill dev server
  Must NOT do: No other changes. No entity modifications. No repository changes.
  References:
    - apps/backend/src/shared/common/persistence/database.module.ts (PERSISTED_ENTITIES)
    - apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity (entity)
    - Commit de49c83 (same pattern for CryptoNewsSourceEntity)
  Acceptance criteria:
    - tsc --noEmit passes
    - jest passes
    - Dev server boots with /crypto-news/messages returning 200
  Commit: Y | fix(ingestion): register CryptoNewsMessageEntity in TypeORM data source

## Final verification wave
- [ ] F1. Plan compliance audit
- [ ] F2. Push to origin/master → auto-deploy triggers
- [ ] F3. Verify prod health (HTTP 200) + /crypto-news endpoint working

## Commit strategy
Single commit. Push → auto-deploy (script is in-place).
