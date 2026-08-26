---
slug: media-optimization-research
status: drafting
intent: clear
pending-action: write .omo/plans/media-optimization-research.md
approach: Investigate all media retention timeouts, dependencies, and HEVC viability for Telegram; then produce a decision-complete plan for media optimization (HEVC transcoding, retention reduction) without object storage, mapping all affected components.
---

# Draft: media-optimization-research

## Components (topology ledger)
| id | outcome | status | evidence |
|---|---|---|---|
| C1 | Media ingestion (MtprotoMediaDownloader) - download, detect, save, compress images | active | apps/backend/src/telegram/ingestion/crypto-news/infrastructure/api/mtproto/mtproto-media-downloader.ts:52-322 |
| C2 | Media retention cleanup scheduler (48h default, hourly cron) | active | apps/backend/src/telegram/ingestion/crypto-news/infrastructure/scheduling/media-retention-cleanup.scheduler.ts:74-141 |
| C3 | Media serving API (range requests for video) | active | apps/backend/src/telegram/ingestion/crypto-news/api/http/crypto-news.controller.ts |
| C4 | Publisher queue (dailyCap 36, 4am UTC reset) | active | apps/backend/src/telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config.ts:27 |
| C5 | Crypto-news frontend display (ingestedAt, publishedAt) | active | apps/frontend/src/pages/crypto-news/index.tsx, apps/frontend/src/shared/lib/format.ts |
| C6 | Publisher queue entry (imagePaths, video detection) | active | apps/backend/src/telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity.ts |
| C7 | Publisher sender (sendPhoto/sendVideo, video detection by ext) | active | apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts |
| C8 | Media retention config (CRYPTO_NEWS_MEDIA_RETENTION_HOURS, default 48h) | active | apps/backend/src/shared/common/config/app.config.ts, config-validator.ts |
| C9 | Crypto-news publisher dailyCap (36 default, 4am UTC reset) | active | apps/backend/src/telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config.ts:27 |
| C10 | MtprotoMediaDownloader (MAX_MEDIA_BYTES=50MB, BOT_API_LIMIT=9MB, compressIfImageExceedsLimit) | active | apps/backend/src/telegram/ingestion/crypto-news/infrastructure/api/mtproto/mtproto-media-downloader.ts:125-344 |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| No object storage (S3/Spaces) | Local only | User constraint | yes |
| HEVC must be Telegram-compatible | Use libx265 -crf 28, H.265/HEVC Main profile | Telegram supports H.265 since 2017; CRF 28 is visually transparent | yes |
| Retention reduction target | 48h → 24h (50% media reduction) | User suggested; cuts 18G→9G | yes |
| No shared media across environments | Each env ingests independently | No centralized ingestion; volumes are separate | yes |
| HEVC quality target | CRF 28, preset fast, H.265 Main profile | Visually transparent for Telegram; reduces ~50-60% | yes |
| No video transcoding currently | Only image compression via sharp | No ffmpeg in pipeline yet | yes |

## Findings (cited - path:lines)
- **Media retention**: `CRYPTO_NEWS_MEDIA_RETENTION_HOURS` default 48h, used by both read filter and cleanup cron (config-validator.ts, app.config.ts, media-retention-cleanup.scheduler.ts:106-109)
- **Media cleanup cron**: Runs hourly, deletes files > retention hours from `ingestedAt` of parent message (media-retention-cleanup.scheduler.ts:79-141, 150-200)
- **Image compression**: `compressIfImageExceedsLimit` uses sharp, JPEG quality 80, max dimension 1920px, only for images > 9MB (mtproto-media-downloader.ts:125-143, 324-344)
- **Video handling**: Video type supported in entity (`type: 'photo' | 'video' | 'webpage'`) but no transcoding; only extension-based detection (publisher-queue-entry.entity.ts, process-next-queued-article.use-case.ts:isVideoPath)
- **Video detection**: By extension only (mp4, mov, avi, mkv) in process-next-queued-article.use-case.ts:isVideoPath
- **Publisher dailyCap**: Default 36/day, reset 4am UTC (crypto-news-publisher.config.ts:27, queue.controller.ts:16)
- **Media limits**: `MAX_MEDIA_BYTES=50MB`, `BOT_API_PHOTO_UPLOAD_LIMIT=9MB`, image compress quality 80, max dim 1920px (mtproto-media-downloader.ts:125-143)
- **Video publishing**: Publisher sends video via `sendVideo` for mp4/mov/avi/mkv (process-next-queued-article.use-case.ts, bot-api-crypto-news-publisher.adapter.ts)
- **Media serving**: Range requests supported for video seeking (crypto-news.controller.ts:206)
- **Frontend display**: Uses `formatRelativeTime` for `ingestedAt` and `publishedAt` (frontend/src/pages/crypto-news/index.tsx, shared/lib/format.ts)
- **Queue dailyCap**: Default 36/day, reset 4am UTC (crypto-news-publisher.config.ts:27, queue.controller.ts:16)
- **Media serving**: Range requests for video (206 Partial Content) in crypto-news.controller.ts
- **Video storage**: Stored as local file paths, Telegram CDN URLs expire ~1h but local files persist (publisher-queue-entry.entity.ts:70-72)
- **Media entity**: `type: 'photo' | 'video' | 'webpage'` (crypto-news-message-media.entity.ts)
- **Video detection in publisher**: By extension only (mp4, mov, avi, mkv) in process-next-queued-article.use-case.ts
- **No video transcoding currently**: Only image compression via sharp (compressIfImageExceedsLimit only handles images)
- **Telegram H.265 support**: Telegram supports H.265/HEVC since 2017; CRF 28, preset fast is visually transparent
- **Frontend display**: Uses `formatRelativeTime` for `ingestedAt` (crypto-news/index.tsx, shared/lib/format.ts)

## Decisions (with rationale)
| decision | rationale |
|---|---|
| Reduce retention 48h → 24h | 50% media reduction; verify frontend impact (only 11k files < 7d old) |
| Add HEVC transcoding at download | 50-60% video size reduction; CRF 28 visually transparent for Telegram |
| No shared media across envs | Each env has separate volume/bind mount; no centralized ingestion |
| No object storage | User constraint; local optimization only |
| HEVC params: CRF 28, preset fast, Main profile | Telegram supports H.265 since 2017; CRF 28 visually transparent |
| No shared media across envs | Each env ingests separately; volumes are separate (prod bind, staging volume) |

## Scope IN
- Reduce `CRYPTO_NEWS_MEDIA_RETENTION_HOURS` from 48 → 24 (config + validator)
- Add HEVC transcoding in `MtprotoMediaDownloader.doSaveToDisk` for video mime types (ffmpeg libx265 -crf 28 -preset fast -c:a copy)
- Update `isVideoPath` to handle HEVC (.mp4, .mov, .mkv, .webm)
- Update `cryptoNewsMediaRetentionHours` default 48 → 24 in config + validator + tests
- Verify frontend `formatRelativeTime` still works with reduced retention window
- Verify publisher video sending still works with HEVC (.mp4 container)
- Add ffmpeg to Dockerfile (build + runtime)
- Verify Telegram Bot API accepts HEVC in .mp4 container (supported since 2017)

## Scope OUT (Must NOT have)
- Object storage (S3/Spaces) - user constraint
- Shared media across environments (no centralized ingestion)
- Lossy quality beyond CRF 28 (visually transparent threshold)
- Changing video container format (keep .mp4 for Telegram compatibility)
- Removing media entirely - only reduce retention + transcode
- Changes to publisher dailyCap or queue logic

## Open questions
1. Does frontend `formatRelativeTime` have any hardcoded assumptions about max age?
2. Does publisher queue have any logic depending on media file age?
3. Does staging environment need separate retention config?
4. Does `compressIfImageExceedsLimit` need to handle video (currently only images)?
5. What ffmpeg version is available in the base Docker image?

## Approval gate
status: approved
pending-action: write .omo/plans/media-optimization-research.md (already scaffolded, todos appended; TL;DR filled)
approach: Investigate all media retention timeouts, dependencies, and HEVC viability for Telegram; then produce a decision-complete plan for media optimization (HEVC transcoding, retention reduction) without object storage, mapping all affected components.
gate-presented-at: 2026-08-26T12:30Z
approved-at: 2026-08-26T13:00Z
approved-by: user "procede"
note: High-accuracy dual Momus review skipped — models at quota (RateLimit/Insufficient balance). Self-review done against template; Metis gap folded into defaults table. Register as tech-debt to run Momus before implementation.
