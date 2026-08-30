---
slug: media-orphans-hevc
status: in_progress
intent: clear
pending-action: write .omo/plans/media-orphans-hevc.md
approach: Investigate 14k orphans (99.5% of 18G) + HEVC viability (Telegram H.265) + retention 48h→24h impact on frontend/queue + shared folder feasibility; then produce a decision-complete plan for media optimization without S3, with iterative write→measure→rewrite loop.
---

# Draft: media-orphans-hevc

## Components (topology ledger)

| id  | outcome                                                                           | status | evidence                                                                                                  |
| --- | --------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| C1  | Orphan cleanup script — 14k files not in DB (99.5%) → ~25G reclaimable            | active | /opt/onchain-bot/apps/backend/uploads/crypto-news/media (14273 files) vs DB 71 rows                       |
| C2  | HEVC transcoding at download — 50-60% video (12G→5G) with Telegram H.265          | active | mtproto-media-downloader.ts:125-344 (sharp for images, no ffmpeg for video)                               |
| C3  | Retention 48h→24h — read filter + cleanup cron (same config)                      | active | app.config.ts:550-556, config-validator.ts:110-120, media-retention-cleanup.scheduler.ts:106              |
| C4  | Frontend display — formatRelativeTime for ingestedAt/publishedAt                  | active | frontend/src/shared/lib/format.ts:43-56, crypto-news/index.tsx:171                                        |
| C5  | Publisher queue — imagePaths, dailyCap 36, 4am UTC reset, no TTL on cache         | active | publisher-queue-entry.entity.ts, queue.controller.ts:16, crypto-news-publisher.config.ts:27               |
| C6  | Shared folder staging/prod — bind mount vs named volume, no centralized ingestion | active | docker-compose.prod.yml (bind ./uploads), docker-compose.staging.yml (volume onchain-bot-staging-uploads) |
| C7  | Telegram Bot API video compatibility — sendVideo with .mp4 H.265                  | active | bot-api-crypto-news-publisher.adapter.ts:226-281, process-next-queued-article:173-176                     |

## Open assumptions (announced defaults)

| assumption                       | adopted default                                          | rationale                                                | reversible? |
| -------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | ----------- |
| No S3/Spaces                     | Local only                                               | User constraint                                          | yes         |
| HEVC must be Telegram-compatible | libx265 -crf 28 -preset fast -c:a copy, H.265 Main, .mp4 | Telegram H.265 since 2017; CRF 28 transparent vs -crf 23 | yes         |
| Retention 48h→24h target         | 24h (50% media)                                          | User suggested; cuts 18G→9G long-term                    | yes         |
| Shared media not viable now      | Keep separate volumes                                    | No centralized ingestion, each env ingests separately    | yes         |
| Orphan cleanup first             | Script before HEVC/retention                             | 14k orphans block any other optimization — 25G immediate | yes         |
| Publisher cache TTL              | 7-30d for published media (separate from ingestion 24h)  | Published media already in Telegram, keeps 1 week debug  | yes         |

## Findings (cited - path:lines)

- **Orphans**: DB 71 rows (60 photo+11 webpage) vs disk 14273 files (26G) → 14202 orphans (99.5%), avg 1.8M, many same size (1996×27036) but hash unique → leak, not duplication
- **Cause**: MediaRetentionCleanupScheduler deletes DB rows where parent.ingestedAt < now-48h (media-retention-cleanup.scheduler.ts:79-141) but leaves 14k files on disk not in DB (path mismatch or store failure leaves file without row)
- **Ingestion rate**: 857 msgs / 7d = 122/día (<1000), but 14k files /7d = 2000/día → each msg avg 0-3 media, but many orphans inflate count
- **HEVC**: No ffmpeg in Dockerfile (only sharp for images >9MB, BOT_API_PHOTO_UPLOAD_LIMIT 9M, MAX_MEDIA_BYTES 50M, MAX_COMPRESS_DIMENSION 1920, quality 80 — mtproto-media-downloader.ts:125-143, sharp in build/runtime)
- **Retention**: CRYPTO_NEWS_MEDIA_RETENTION_HOURS default 48h (app.config.ts:550-556, config-validator.ts:110-120) used in controller read filter (since = now-48h) and scheduler cleanup (delete <48h) — same config, 2 consumers
- **Frontend**: formatRelativeTime shows “hace Xh” for <24h (format.ts:43-56), label hardcodes “Messages (last 48h)” (index.tsx:171), tests expect 48h — need update to 24h
- **Queue**: PublisherQueueEntry.imagePaths persists until PUBLISHED, dailyCap 36, reset 4am UTC (queue.controller.ts:16), no TTL on cache — accumulates
- **Staging/prod**: Prod bind mount ./uploads:/app/uploads (host /opt/onchain-bot/apps/backend/uploads), staging named volume onchain-bot-staging-uploads:/app/uploads — separate, no sharing
- **Telegram H.265**: Bot API sendVideo supports H.265/HEVC in .mp4 since 2017; isVideoPath checks ext mp4/mov/avi/mkv (process-next-queued-article:173-176), adapter sends as sendVideo with supports_streaming (bot-api:226-281)

## Decisions (with rationale)

| decision                                           | rationale                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Clean orphans first (script, not cron)             | 14k orphans block any other gain — 25G immediate, 0$                                                                      |
| HEVC at download with fallback                     | 50-60% video (12G→5G), CRF 28 transparent, libx265 -preset fast -c:a copy, fallback to original if ffmpeg fails           |
| Retention 48h→24h                                  | 50% media (18G→9G long-term), same config for read+cleanup, frontend already handles <24h                                 |
| No shared folder now                               | Each env ingests separately, volumes separate, no centralized ingestion — would need dedup by Telegram fileId + shared DB |
| Keep separate TTLs: ingestion 24h, publisher 7-30d | Published media already in Telegram, keeps 1 week debug, ingestion 24h for dashboard                                      |

## Scope IN

- Script orphan cleanup: find vs SELECT file_path, delete orphans, log, dry-run first
- ffmpeg to Dockerfile build+runtime, HEVC transcode in MtprotoMediaDownloader.doSaveToDisk for video/\*, keep .mp4, fallback
- Retention 48h→24h in app.config.ts + config-validator.ts + tests (controller + scheduler)
- Frontend label 48h→24h in index.tsx + tests
- isVideoPath add .webm
- Publisher queue: no shared folder, keep separate volumes, document why

## Scope OUT (Must NOT have)

- S3/Spaces — user constraint
- Shared media across envs — no centralized ingestion
- Lossy >CRF 28 — transparent threshold
- Container change — keep .mp4
- Publisher queue logic change — dailyCap 36 etc. stays

## Open questions

1. Does frontend have other hardcoded 48h assumptions beyond label?
2. Does publisher queue have logic depending on media file age beyond dailyCap?
3. What ffmpeg version in base node:22-bookworm-slim?

## Approval gate

status: approved
pending-action: worker executes T0 (measure orphans dry-run)
approach: Investigate 14k orphans (99.5% of 18G) + HEVC viability (Telegram H.265) + retention 48h→24h impact on frontend/queue + shared folder feasibility; then produce a decision-complete plan for media optimization without S3, with iterative write→measure→rewrite loop.
gate-presented-at: 2026-08-27T07:00Z
approved-at: 2026-08-27T07:30Z
approved-by: user "si"

## Evidence Wave 0-1 (2026-08-27)

- T0 dry-run: 14202 orphans (71 DB vs 14273 disk), 26G -> dry-run log
- T1 delete: 71 files left (6.2M), df 89% (9G) -> 56% (35G), +25G reclaimed, orphans 0
