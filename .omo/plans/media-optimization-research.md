# media-optimization-research - Work Plan

## TL;DR (For humans)

**What you'll get:** A media optimization plan that reduces 18G of crypto-news media (70% video) by ~50% through HEVC transcoding (CRF 28, preset fast) and retention reduction (48h→24h), all without object storage, preserving Telegram compatibility (H.265/HEVC in .mp4 container, CRF 28 visually transparent).

**Why this approach:** HEVC (H.265) reduces video 50-60% at CRF 28 (visually transparent for Telegram), retention 48h→24h cuts media 50% (all files <7d old). Combined ~50-60% total reduction (18G→8-9G) without object storage, preserving Telegram H.265 compatibility in .mp4.

**What it will NOT do:** No object storage (S3/Spaces), no shared media across environments (separate ingestion), no quality loss beyond CRF 28 (visually transparent), no video container change (.mp4 kept for Telegram), no publisher queue logic changes.

**Effort:** Medium
**Risk:** Low - HEVC is Telegram-compatible since 2017, CRF 28 visually transparent, retention 48h→24h safe (all current files <7d)
**Decisions to sanity-check:** HEVC CRF 28 quality for Telegram, retention 24h business impact, ffmpeg availability in Docker

Your next move: Approve this plan to proceed with implementation tasks. Full execution detail follows below.

---

> TL;DR (machine): Medium, Low, HEVC transcoding + 48h→24h retention → 18G→8-9G media, Telegram compatible, no object storage

## Scope
### Must have
- Add HEVC transcoding in `MtprotoMediaDownloader.doSaveToDisk` for video mime types (ffmpeg libx265 -crf 28 -preset fast -c:a copy)
- Reduce `CRYPTO_NEWS_MEDIA_RETENTION_HOURS` default from 48 → 24 in config + validator + tests
- Update `isVideoPath` to handle HEVC (.mp4, .mov, .mkv, .webm) in `process-next-queued-article.use-case.ts`
- Update `cryptoNewsMediaRetentionHours` default 48 → 24 in config + validator + tests
- Add ffmpeg to Dockerfile (build + runtime stages)
- Verify Telegram Bot API accepts HEVC in .mp4 container (supported since 2017)
- Verify frontend `formatRelativeTime` still works with reduced retention window
- Verify publisher video sending works with HEVC (.mp4 container)
- Add ffmpeg to Dockerfile (build + runtime stages)

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No object storage (S3/Spaces) - user constraint
- No shared media across environments (no centralized ingestion)
- No quality loss beyond CRF 28 (visually transparent threshold)
- No changing video container format (.mp4 kept for Telegram compatibility)
- No removing media entirely - only reduce retention + transcode
- No changes to publisher dailyCap or queue logic
- No shared media across environments (no centralized ingestion)
- No changes to publisher dailyCap or queue logic

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + tests-after (unit tests for new transcoding logic, integration tests for media pipeline)
- Evidence: `.omo/evidence/task-<N>-media-optimization-research.<ext>`
- Happy path: HEVC transcoded video plays in Telegram, retention 24h deletes old media, disk usage drops to ~8-9G
- Failure path: HEVC not playable in Telegram → fallback to H.264; retention 24h breaks frontend → rollback config

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
|---|---|---|---|
| T1: Add ffmpeg to Dockerfile | — | T2, T3 | — |
| T2: Add HEVC transcoding in MtprotoMediaDownloader | T1 | T3 | — |
| T3: Update isVideoPath for HEVC | T2 | T4 | — |
| T4: Reduce retention 48h→24h (config + validator + tests) | — | T5 | T2, T3 |
| T5: Update tests for retention 24h | T4 | — | — |
| T6: Add ffmpeg to Dockerfile runtime | T1 | T7 | — |
| T7: Integration test (deploy + healthcheck) | T2, T3, T4, T6 | F1 | — |
| T8: Verify frontend formatRelativeTime | T4 | F1 | — |
| T9: Verify publisher video sending | T2, T3 | F1 | — |
| T10: Update tests for retention config | T4 | F1 | — |

### Parallel execution waves
- Wave 1: T1 (Dockerfile ffmpeg)
- Wave 2: T2 (HEVC transcoding), T4 (retention config)
- Wave 3: T3 (isVideoPath), T6 (Dockerfile runtime), T8 (frontend verify)
- Wave 4: T5 (retention tests), T9 (publisher verify)
- Wave 5: T7 (integration test), T10 (retention tests)

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Add ffmpeg to Dockerfile (build stage)
  What to do: Add `RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg` to build stage in `apps/backend/Dockerfile`. Ensure ffmpeg available for HEVC transcoding during build.
  Must NOT do: Remove existing packages, change base image.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 6
  References: apps/backend/Dockerfile:1-44
  Acceptance criteria: `docker build` succeeds, `ffmpeg -version` runs in container
  QA scenarios: happy: `docker run --rm <image> ffmpeg -version` shows version. failure: build fails → fix apt packages.
  Commit: Y | perf(docker): add ffmpeg for HEVC transcoding

- [ ] 2. Add HEVC transcoding in MtprotoMediaDownloader.doSaveToDisk
  What to do: In `mtproto-media-downloader.ts:doSaveToDisk`, detect video mime type, run ffmpeg transcoding to HEVC (libx265 -crf 28 -preset fast -c:a copy) before saving. Keep .mp4 container. Fallback to original if ffmpeg fails.
  Must NOT do: Change container format (.mp4), lose audio, exceed CRF 28.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3, 9
  References: apps/backend/src/telegram/ingestion/crypto-news/infrastructure/api/mtproto/mtproto-media-downloader.ts:108-144
  Acceptance criteria: Video downloaded → transcoded to HEVC (libx265 -crf 28 -preset fast) → saved as .mp4 → playable in Telegram
  QA scenarios: happy: video downloaded → HEVC transcoded → plays in Telegram. failure: ffmpeg fails → fallback to original.
  Commit: Y | feat(media): add HEVC transcoding for videos

- [ ] 3. Update isVideoPath for HEVC extensions
  What to do: In `process-next-queued-article.use-case.ts:isVideoPath`, add .webm to video extensions. Ensure .mp4 (HEVC) still detected.
  Must NOT do: Remove existing extensions, change video detection logic.
  Parallelization: Wave 3 | Blocked by: 2 | Blocks: 9
  References: apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts:isVideoPath
  Acceptance criteria: `.mp4`, `.mov`, `.mkv`, `.webm` all detected as video
  QA scenarios: happy: all extensions detected. failure: regression in detection → fix.
  Commit: Y | fix(publisher): add webm to video extensions

- [ ] 4. Reduce retention 48h→24h (config + validator + tests)
  What to do: Change default in `app.config.ts` from 48 to 24. Update `config-validator.ts` default. Update tests expecting 48h.
  Must NOT do: Remove config option, break existing deployments.
  Parallelization: Wave 2 | Blocked by: — | Blocks: 5, 8, 10
  References: apps/backend/src/shared/common/config/app.config.ts, config-validator.ts, media-retention-cleanup.scheduler.ts:106
  Acceptance criteria: Default retention 24h, config-validator accepts 24h, tests pass
  QA scenarios: happy: default 24h works. failure: validator rejects 24h → fix.
  Commit: Y | feat(config): reduce media retention 48h→24h

- [ ] 5. Update tests for retention 24h
  What to do: Update tests in `media-retention-cleanup.scheduler.spec.ts` and `crypto-news.controller.spec.ts` expecting 48h → 24h.
  Must NOT do: Remove tests, weaken assertions.
  Parallelization: Wave 5 | Blocked by: 4 | Blocks: —
  References: apps/backend/src/telegram/ingestion/crypto-news/infrastructure/scheduling/__tests__/media-retention-cleanup.scheduler.spec.ts
  Acceptance criteria: All tests pass with 24h default
  QA scenarios: happy: tests pass. failure: test expects 48h → update expectation.
  Commit: Y | test: update retention tests for 24h default

- [ ] 6. Add ffmpeg to Dockerfile runtime stage
  What to do: Add `RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg` to runtime stage in `apps/backend/Dockerfile`.
  Must NOT do: Bloat image unnecessarily, remove existing packages.
  Parallelization: Wave 3 | Blocked by: 1 | Blocks: 7
  References: apps/backend/Dockerfile:19-44
  Acceptance criteria: `docker build` succeeds, `ffmpeg -version` runs in runtime container
  QA scenarios: happy: runtime container has ffmpeg. failure: build fails → fix apt.
  Commit: Y | perf(docker): add ffmpeg to runtime for HEVC

- [ ] 7. Integration test (deploy + healthcheck)
  What to do: Deploy to staging, verify HEVC video plays in Telegram, healthcheck passes, disk usage <80%.
  Must NOT do: Skip healthcheck, deploy without verification.
  Parallelization: Wave 5 | Blocked by: 2, 3, 4, 6 | Blocks: —
  References: .github/workflows/deploy.yml, deploy-staging.yml
  Acceptance criteria: Deploy succeeds, healthcheck passes, video plays in Telegram, disk <80%
  QA scenarios: happy: deploy succeeds, video plays. failure: healthcheck fails → debug logs.
  Commit: Y | test(integration): verify HEVC deploy

- [ ] 8. Verify frontend formatRelativeTime
  What to do: Verify `formatRelativeTime` in `shared/lib/format.ts` works with 24h retention (shows "hace Xh" correctly for <24h).
  Must NOT do: Change format logic, break existing displays.
  Parallelization: Wave 3 | Blocked by: 4 | Blocks: —
  References: apps/frontend/src/shared/lib/format.ts:43-56, apps/frontend/src/pages/crypto-news/index.tsx
  Acceptance criteria: Frontend shows correct relative times for <24h media
  QA scenarios: happy: times display correctly. failure: shows wrong format → fix format.ts.
  Commit: Y | test(frontend): verify relative time with 24h retention

- [ ] 9. Verify publisher video sending with HEVC
  What to do: Verify `process-next-queued-article.use-case.ts` sends HEVC video via `sendVideo` correctly.
  Must NOT do: Change video sending logic, break Telegram compatibility.
  Parallelization: Wave 4 | Blocked by: 2, 3 | Blocks: —
  References: apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts
  Acceptance criteria: HEVC video sent via sendVideo, plays in Telegram
  QA scenarios: happy: video sent and plays. failure: Telegram rejects → debug container/format.
  Commit: Y | test(publisher): verify HEVC video sending

- [ ] 10. Update tests for retention config
  What to do: Update `config-validator.spec.ts` and `app.config.ts` tests for 24h default.
  Must NOT do: Weaken validation, remove assertions.
  Parallelization: Wave 5 | Blocked by: 4 | Blocks: —
  References: apps/backend/src/shared/common/config/__tests__/config-validator.spec.ts, app.config.ts tests
  Acceptance criteria: All config tests pass with 24h default
  QA scenarios: happy: tests pass. failure: validator test expects 48 → update.
  Commit: Y | test(config): update retention validator tests

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit — verify every todo has references + acceptance + QA + commit, each evidence file exists under .omo/evidence/media-optimization-research/
- [ ] F2. Code quality review — `npm run lint` + `npm run test` (backend/frontend) pass, Dockerfiles build, compose config valid
- [ ] F3. Real manual QA — agent runs deploy to staging, verifies HEVC video plays in Telegram, healthcheck passes, disk usage <80%, media retention 24h works
- [ ] F4. Scope fidelity — confirm Must NOT have held: no object storage, no shared media, no quality loss beyond CRF 28, no container change, no publisher logic changes

## Commit strategy
- One commit per todo (10 commits) + one per wave evidence capture; squash not required within wave but each todo commit is atomic and revertable
- Commit types: `feat`, `fix`, `perf`, `test`, `docs` as per todo; scope in parens matches file domain (docker, media, config, publisher, frontend, test)
- Push per wave after green QA; draft rewritten after each wave with new baseline `df` before next wave

## Success criteria
- HEVC transcoding works: videos transcoded to H.265/HEVC Main profile CRF 28, play in Telegram
- Retention 48h→24h: config default changed, validator accepts 24h, tests pass
- Disk usage: baseline 84% (13G Avail) maintained or improved after deploy with HEVC
- HEVC playback: videos play in Telegram (H.265/HEVC in .mp4 supported since 2017)
- No regressions: CI passes, healthcheck passes, publisher sends video, frontend displays correctly
- No Scope OUT violations: no object storage, no shared media, no quality loss beyond CRF 28, no .mp4 change
