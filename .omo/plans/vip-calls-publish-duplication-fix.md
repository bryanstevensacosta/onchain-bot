# Plan: Fix WOKE Message Duplication Bug (1014/1015)

**Created:** 2026-07-01
**Status:** ✅ COMPLETED

## Problem
- Messages being published twice to Telegram VIP channel (IDs 1014, 1015)
- Root cause: race condition between concurrent publish attempts + no uniqueness constraint on telegram_message_id

## Constraints
- NO deleteMessage calls anywhere in production code (hard rule)
- Maintain backward compatibility with existing tests
- Preserve FilteredBootstrapLogger behavior

## Dependency Matrix

| Task | Description | Status | Files |
|---|---|---|---|
| 1 | Add correlation-id logging to trace handler execution | ✅ DONE | vip-calls-publish.use-case.ts, token-approved-publish.handler.ts |
| 2 | Reproduce bug via curl to confirm handler pre-check works | ✅ DONE | (manual curl test confirmed) |
| 3 | Implement tryReserve flow: atomic DB reservation before Telegram call | ✅ DONE | vip-calls-publish.use-case.ts |
| 4 | Add fail-closed handler: mark FAILED on Telegram exception | ✅ DONE | token-approved-publish.handler.ts |
| 5 | Add UNIQUE INDEX + reconciler scheduler | ✅ DONE | published-call.entity.ts, reconcile-stuck-reservations.use-case.ts |
| 6 | Migrate from custom logger to nestjs-pino | ✅ DONE | main.ts, app.module.ts |
| 7 | Add dev scripts + .gitignore for LOG_DIR | ✅ DONE | verify-logger-boot.ts, .gitignore |

## Verification (F1-F4)

| ID | Check | Status |
|---|---|---|
| F1 | Correlation-id logs visible in console | ✅ DONE |
| F2 | tryReserve prevents duplicate inserts at DB level | ✅ DONE |
| F3 | Reconciler runs every 30s, cleans stuck reservations | ✅ DONE |
| F4 | nestjs-pino writes to apps/backend/logs/ | ✅ DONE |

## Commits

1. `7edd992` - fix(vip-calls): prevent duplicate publishes via tryReserve + UNIQUE index
2. `0762aee` - feat(logging): consolidate to nestjs-pino with rotated files
3. `d37b27c` - refactor: update all publish ports/repos to return telegram_message_id

## Tests
- 701/701 passing
- 0 lint errors

## Post-Mortem Capability
- Logs now in `apps/backend/logs/backend-<env>.log`
- Structured JSON with correlation IDs
- 14-day retention with daily rotation