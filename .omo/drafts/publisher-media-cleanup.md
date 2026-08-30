---
slug: publisher-media-cleanup
status: drafting
intent: clear
pending-action: write .omo/plans/publisher-media-cleanup.md
approach: Add post-publication media cleanup with configurable TTL to prevent disk exhaustion from publisher cache. Non-breaking: only deletes already-published media older than TTL, configurable via env, default 30 days (0 = disabled).
---

# Draft: publisher-media-cleanup

## Components (topology ledger)

| id  | outcome                                                                                          | status | evidence                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| C1  | Post-publication cleanup in `ProcessNextQueuedArticleUseCase` - delete published media after TTL | active | apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts              |
| C2  | Config `PUBLISHER_MEDIA_TTL_DAYS` (default 30, 0=disabled)                                       | active | apps/backend/src/shared/common/config/app.config.ts                                                                       |
| C3  | Config validator for TTL (min 0, max 365)                                                        | active | apps/backend/src/shared/common/config/config-validator.ts                                                                 |
| C4  | Cleanup utility: delete file if exists, log result                                               | active | new file: apps/backend/src/telegram/crypto-news-publisher/infrastructure/services/media-cleanup.service.ts                |
| C5  | Unit tests for cleanup logic                                                                     | active | new file: apps/backend/src/telegram/crypto-news-publisher/infrastructure/services/**tests**/media-cleanup.service.spec.ts |

## Open assumptions (announced defaults)

| assumption                    | adopted default      | rationale                                                | reversible? |
| ----------------------------- | -------------------- | -------------------------------------------------------- | ----------- |
| TTL default                   | 30 days              | Conservative; keeps media for replay/debug; 0 = disabled | yes         |
| Max TTL                       | 365 days             | Prevent accidental huge values                           | yes         |
| Clean on publish success only | Yes                  | Only delete after confirmed publish                      | yes         |
| Only delete published media   | Yes                  | Don't touch queued/failed/blocked media                  | yes         |
| No breaking changes           | Default 0 = disabled | Existing deployments unaffected                          | yes         |

## Findings (cited - path:lines)

- Publisher cache at `/opt/onchain-bot/uploads/crypto-news/media/` accumulates 18G+ (11k+ files, all < 7d) - no TTL exists
- `ProcessNextQueuedArticleUseCase.execute()` publishes then does NOT clean media (process-next-queued-article.use-case.ts:150-220)
- `BotApiCryptoNewsPublisherAdapter.sendPhoto/sendVideo` uploads local file but doesn't delete after (bot-api-crypto-news-publisher.adapter.ts:226-281)
- `PublisherQueueEntry` has `imagePaths` and `status` - can detect PUBLISHED state (publisher-queue-entry.entity.ts:50-55)
- Config `CryptoNewsPublisherConfig` already exists with `dailyCap`, `dailyResetUtcHour` - can add `mediaTtlDays` (crypto-news-publisher.config.ts:27-35)
- Config validator exists for `CRYPTO_NEWS_MEDIA_RETENTION_HOURS` - pattern to follow (config-validator.ts:110-120)

## Decisions (with rationale)

| decision                         | rationale                                                                  |
| -------------------------------- | -------------------------------------------------------------------------- |
| Cleanup on publish success       | Only delete after confirmed PUBLISHED; failed/blocked media kept for retry |
| TTL default 30 days              | Conservative; allows replay/debug; 0 = disabled                            |
| Max TTL 365 days                 | Prevent accidental huge values                                             |
| Cleanup in UseCase after publish | Atomic with publish; no separate cron needed                               |
| Separate service class           | Testable, reusable, single responsibility                                  |
| No cron for this                 | Cleanup on publish is sufficient; no separate scheduler needed             |
| Default 0 = disabled             | Zero breaking changes; opt-in                                              |

## Scope IN

- Add `mediaTtlDays` to `CryptoNewsPublisherConfig` (default 0 = disabled, max 365)
- Add config validator for `PUBLISHER_MEDIA_TTL_DAYS` (min 0, max 365)
- Create `MediaCleanupService` with `cleanupPublishedMedia(paths, ttlDays)`
- In `ProcessNextQueuedArticleUseCase.execute()` after `markPublished`, call cleanup
- Only delete files for entries that reached `PUBLISHED` status
- Only delete files listed in `entry.imagePaths`
- Log cleanup results (deleted count, errors)
- Handle missing files gracefully (log, don't throw)

## Scope OUT (Must NOT have)

- No breaking changes (default 0 = disabled)
- No cron job for cleanup (cleanup on publish is sufficient)
- No deletion of queued/failed/blocked media
- No changes to ingestion media retention (separate config)
- No changes to publisher queue logic (dailyCap, etc.)
- No object storage integration
- No shared media across environments

## Open questions

1. Should cleanup also handle `video` files specifically (larger)?
2. Should we add a manual cleanup endpoint for emergency?
3. What about media from failed publishes that stay in queue?

## Approval gate

status: approved
pending-action: write .omo/plans/publisher-media-cleanup.md (already scaffolded, todos appended; TL;DR filled)
approach: Add post-publication media cleanup with configurable TTL to prevent disk exhaustion from publisher cache. Non-breaking: only deletes already-published media older than TTL, configurable via env, default 30 days (0 = disabled).
gate-presented-at: 2026-08-26T16:00Z
approved-at: 2026-08-26T16:05Z
approved-by: user "si es lo recomendable como devops y engineer si"
note: High-accuracy dual Momus review skipped — models at quota. Self-review done against template. Non-breaking by design (default 0 = disabled).
