# publisher-media-cleanup - Work Plan

## TL;DR (For humans)

**What you'll get:** A non-breaking media cleanup that automatically deletes already-published media files from the publisher cache after a configurable TTL (default 30 days, 0 = disabled). This prevents the 18G+ disk exhaustion caused by the publisher cache accumulating indefinitely, without breaking any existing functionality.

**Why this approach:** The publisher cache at `/opt/onchain-bot/uploads/crypto-news/media/` has accumulated 18G+ because there's no TTL on published media. The existing 24h retention only applies to ingestion (KOL messages), not the publisher cache. This fix adds cleanup on publish success with configurable TTL (default 30 days, 0 = disabled), zero breaking changes.

**What it will NOT do:** No breaking changes (default 0 = disabled), no cron job (cleanup on publish is sufficient), no deletion of queued/failed/blocked media, no object storage, no shared media across environments, no changes to publisher queue logic.

**Effort:** Short
**Risk:** Low - default 0 = disabled, only deletes already-published media, configurable TTL
**Decisions to sanity-check:** TTL default 30 days (0 = disabled), max 365 days, cleanup only on PUBLISHED, configurable via PUBLISHER_MEDIA_TTL_DAYS

Your next move: Approve this plan to proceed with implementation. Full execution detail follows below.

---

> TL;DR (machine): Short, Low, Post-publish media cleanup with configurable TTL (default 0=disabled), non-breaking, prevents 18G+ disk exhaustion

---

## Scope

### Must have

- Add `mediaTtlDays` to `CryptoNewsPublisherConfig` (default 0 = disabled, max 365)
- Add config validator for `PUBLISHER_MEDIA_TTL_DAYS` (min 0, max 365)
- Create `MediaCleanupService` with `cleanupPublishedMedia(paths, ttlDays)`
- In `ProcessNextQueuedArticleUseCase.execute()` after `markPublished`, call cleanup
- Only delete files for entries that reached `PUBLISHED` status
- Only delete files listed in `entry.imagePaths`
- Log cleanup results (deleted count, errors)
- Handle missing files gracefully (log, don't throw)

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No breaking changes (default 0 = disabled)
- No cron job for cleanup (cleanup on publish is sufficient)
- No deletion of queued/failed/blocked media
- No changes to ingestion media retention (separate config)
- No changes to publisher queue logic (dailyCap, etc.)
- No object storage integration
- No shared media across environments

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: TDD + tests-after (unit tests for cleanup service, integration test for publish+cleanup)
- Evidence: `.omo/evidence/task-<N>-publisher-media-cleanup.<ext>`
- Happy path: Publish → media deleted after TTL, disk usage stable, publisher still works
- Failure path: Missing file → log warning, continue; TTL=0 → no deletion; config error → default 0

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

### Dependency matrix

| Todo                                                     | Depends on | Blocks | Can parallelize with |
| -------------------------------------------------------- | ---------- | ------ | -------------------- |
| T1: Add mediaTtlDays to CryptoNewsPublisherConfig        | —          | T2, T3 | T2                   |
| T2: Add config validator for PUBLISHER_MEDIA_TTL_DAYS    | T1         | T3     | —                    |
| T3: Create MediaCleanupService                           | T1, T2     | T4     | —                    |
| T4: Integrate cleanup in ProcessNextQueuedArticleUseCase | T3         | T5     | —                    |
| T5: Unit tests for MediaCleanupService                   | T3         | T6     | T4                   |
| T6: Integration test (publish + cleanup)                 | T4         | F1     | —                    |

### Parallel execution waves

- Wave 1: T1 (config), T2 (validator)
- Wave 2: T3 (MediaCleanupService)
- Wave 3: T4 (integrate in UseCase)
- Wave 4: T5 (unit tests)
- Wave 5: T6 (integration test)

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Add mediaTtlDays to CryptoNewsPublisherConfig
     What to do: Add `mediaTtlDays` field to `CryptoNewsPublisherConfig` interface and `DEFAULT_CONFIG` (default 0 = disabled, max 365). Update `loadCryptoNewsPublisherConfig` to read `PUBLISHER_MEDIA_TTL_DAYS` env var.
     Must NOT do: Change existing fields, break existing configs.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 3
     References: apps/backend/src/telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config.ts:1-50
     Acceptance criteria: Config has `mediaTtlDays` field with default 0, reads from env var
     QA scenarios: happy: config loads with default 0. failure: invalid value >365 → validation error.
     Commit: Y | feat(config): add publisher media TTL config

- [ ] 2. Add config validator for PUBLISHER_MEDIA_TTL_DAYS
     What to do: Add validator in `config-validator.ts` for `PUBLISHER_MEDIA_TTL_DAYS` (min 0, max 365, integer).
     Must NOT do: Break existing validator, allow invalid values.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3
     References: apps/backend/src/shared/common/config/config-validator.ts:110-120
     Acceptance criteria: Validator accepts 0-365, rejects <0 or >365
     QA scenarios: happy: 30 passes, 0 passes. failure: -1 fails, 366 fails.
     Commit: Y | feat(config): add publisher media TTL validator

- [ ] 3. Create MediaCleanupService
     What to do: Create `MediaCleanupService` with `cleanupPublishedMedia(paths: string[], ttlDays: number): Promise<{deleted: number, errors: string[]}>`. Delete files older than TTL days, log results, handle missing files gracefully.
     Must NOT do: Throw on missing files, delete non-media files, use sync I/O in hot path.
     Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 4
     References: apps/backend/src/telegram/crypto-news-publisher/infrastructure/services/ (new file)
     Acceptance criteria: Service deletes files older than TTL, logs deleted count/errors, handles missing files
     QA scenarios: happy: files older than TTL deleted. failure: missing file → logged, not thrown.
     Commit: Y | feat(media): add MediaCleanupService for post-publish cleanup

- [ ] 4. Integrate cleanup in ProcessNextQueuedArticleUseCase
     What to do: In `ProcessNextQueuedArticleUseCase.execute()`, after `entry.markPublished()`, call `mediaCleanupService.cleanupPublishedMedia(entry.imagePaths, config.mediaTtlDays)`.
     Must NOT do: Cleanup on failure/blocked, delete non-imagePaths files, block publish on cleanup failure.
     Parallelization: Wave 3 | Blocked by: 3 | Blocks: 5
     References: apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts:150-220
     Acceptance criteria: After publish, cleanup called with entry.imagePaths and config.mediaTtlDays
     QA scenarios: happy: published → cleanup runs. failure: cleanup error → logged, publish succeeds.
     Commit: Y | feat(publisher): add post-publish media cleanup

- [ ] 5. Unit tests for MediaCleanupService
     What to do: Create `__tests__/media-cleanup.service.spec.ts` testing: deletes old files, skips new files, handles missing files, TTL=0 skips all, logs errors.
     Must NOT do: Use real filesystem without mocking, skip error cases.
     Parallelization: Wave 4 | Blocked by: 3 | Blocks: 6
     References: apps/backend/src/telegram/crypto-news-publisher/infrastructure/services/**tests**/media-cleanup.service.spec.ts (new)
     Acceptance criteria: All tests pass, coverage >90%
     QA scenarios: happy: old files deleted. failure: missing file logged.
     Commit: Y | test(media): add MediaCleanupService tests

- [ ] 6. Integration test (deploy + verify cleanup)
     What to do: Deploy to staging, publish test article with media, verify cleanup runs, disk usage stable.
     Must NOT do: Skip healthcheck, deploy without verification.
     Parallelization: Wave 5 | Blocked by: 4 | Blocks: F1
     References: .github/workflows/deploy-staging.yml
     Acceptance criteria: Deploy succeeds, healthcheck passes, media cleanup runs, disk usage stable
     QA scenarios: happy: cleanup runs, disk stable. failure: healthcheck fails → debug.
     Commit: Y | test(integration): verify post-publish cleanup

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verify every todo has references + acceptance + QA + commit, each evidence file exists under .omo/evidence/publisher-media-cleanup/
- [ ] F2. Code quality review — `npm run lint` + `npm run test` (backend/frontend) pass, Dockerfiles build, compose config valid
- [ ] F3. Real manual QA — agent runs deploy to staging, publishes test article, verifies cleanup runs, disk usage stable
- [ ] F4. Scope fidelity — confirm Must NOT have held: no breaking changes, no cron, no queued media deletion, no object storage

## Commit strategy

- One commit per todo (6 commits) + evidence capture; each todo commit atomic and revertable
- Commit types: `feat`, `test`, `docs` as per todo; scope in parens matches file domain (config, media, publisher, test)
- Push per wave after green QA; draft rewritten after each wave with new baseline `df` before next wave

## Success criteria

- Post-publish cleanup runs automatically, deletes media older than TTL (default 0=disabled)
- Disk usage stable after multiple publishes (no accumulation)
- Default 0 = disabled (zero breaking changes)
- Configurable TTL 0-365 days via `PUBLISHER_MEDIA_TTL_DAYS`
- All tests pass (1866+ backend, frontend)
- Deploy to staging succeeds, healthcheck passes
- No Scope OUT violations: no breaking changes, no cron, no queued media deletion, no object storage
