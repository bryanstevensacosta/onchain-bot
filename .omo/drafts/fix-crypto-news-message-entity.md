---
slug: fix-crypto-news-message-entity
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/fix-crypto-news-message-entity.md
approach: Add CryptoNewsMessageEntity to PERSISTED_ENTITIES in database.module.ts (same pattern as commit de49c83 for CryptoNewsSourceEntity).
---

# Draft: fix-crypto-news-message-entity

## Findings (cited - path:lines)
1. `GET /crypto-news/messages?limit=50` returns HTTP 500 — confirmed by Playwright test
2. Root cause: `CryptoNewsMessageEntity` is NOT in `PERSISTED_ENTITIES` in `apps/backend/src/shared/common/persistence/database.module.ts` — same bug as `CryptoNewsSourceEntity` (fix: de49c83)
3. `CryptoNewsMessageEntity` exists at `telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity`
4. `TypeOrmCryptoNewsMessageRepository` calls `this.repo.find()` which throws `EntityMetadataNotFoundError` when entity isn't registered
5. Fix is identical to de49c83: 1 import + 1 entry in PERSISTED_ENTITIES
6. Deploy fix already in place: scripts/deploy.sh + correct script_path in workflow

## Decisions
1. Same pattern as de49c83 — minimal fix, no architecture changes
2. Single commit, auto-deploy via updated workflow

## Scope IN
- `database.module.ts`: import `CryptoNewsMessageEntity` + add to `PERSISTED_ENTITIES`
- Verify: tsc clean + jest passes + dev boot (crypto-news returns 200 instead of 500)
- Commit + push → auto-deploy

## Scope OUT
- No changes to entity, repository, or any other file
- No other entity registrations (only the Message, not others)

## Approval gate
status: awaiting-approval
