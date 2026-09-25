# Changelog — ingestion-telegram

Manual changelog (see root `RELEASE-FLOW.md`). Version history starts from v1.0.0.

## [Unreleased]

### Added

- Permanent avatar module: `GET /api/kol-avatar/:channelId` (public, 200 placeholder) + `POST .../refresh` (guarded, single re-fetch); fetch-once at registration, excluded from the 72h janitor, under the `kol-avatar` flood guard; `avatarUrl` in `GET /api/feed/sources`; migration `1790300000000-KolAvatarColumns`. (feat/mega-refactor-tramos)

### Changed

- Feed rename (code-level): `crypto_news_*` tables → `telegram_feed_*` (`telegram_feed_sources/messages/message_media`, migrations `1790000000000`/`1790045326364`/`1790100000000`/`1790200000000`), on-disk media prefix `uploads/crypto-news/media` → `uploads/feed/media` (legacy paths rewritten by `feed-path-builder`), and transformer renames (`news-text-extractor` → `feed-text-extractor`, `news-message-transformer` → `feed-message-transformer`). (feat/mega-refactor-tramos)
- Docs: `twin` → staging ingestion (`ingestion-telegram-staging`). (feat/mega-refactor-tramos)

## [1.2.0] - 2026-09-24

### Added

- `telegram_feed_*` tables (+ JSONB columns, GIN indexes). (PR #246)
- Per-env twin support: staging compose + dispatch lanes. (PR #246)
- OpenAPI feed tags. (PR #246)

### Changed

- Media moved to `uploads/feed/media`. (PR #246)

### Fixed

- Dedup cursor-loss fix + monotonic cursors. (PR #246)
- SSE simplification: registration, 401 gate, union, dual-broadcast and dead code deleted. (PR #246)

### Removed

- BREAKING: `/api/crypto-news/*` removed → `/api/feed/*` (+ `?type=` filter). (PR #246)

## [1.1.0] - 2026-09-18

Rename GA: `ingestion-service` is now `ingestion-telegram` (MINOR: new optional config, no breaking change — old var still honored).

### Changed

- Rename GA `ingestion-service` → `ingestion-telegram` (workspace, GHCR image, container, compose, env). Consumers can now point at the service via the new optional `INGESTION_TELEGRAM_URL`; the deprecated `INGESTION_SERVICE_URL` is still honored as fallback. (PR #231)

### Fixed

- Post-cutover proxy: nginx upstream flipped to the new `onchain-bot-ingestion-telegram` DNS with lazy resolver, `/ingestion-api/` → `/api/` rewrite-strip fix, and new/old env fallback in `deploy-ingestion.yml` backup/migrations/restart steps. (PR #234)

### Notes

- Release housekeeping (no code): the old `ingestion-service-v1.0.0` tag and release were mirrored to `ingestion-telegram-v1.0.0` and retired on 2026-09-18 (announced in PR #231, verified post-merge).
- Post-rename cleanup tracked in #235.

## [1.0.0] - 2026-09-11

**Baseline release**: Version reset for consistency across monorepo. This is the first official release with all apps aligned at v1.0.0.

### Features

- Centralized Telegram MTProto ingestion service (single session feeds all backends)
- SSE streaming API with 30-second heartbeat
- HTTP API for crypto-news sources and messages
- Media download and serving (`uploads/crypto-news/media/`)
- 72-hour retention cleanup for messages and media
- Redis cursor tracking for polling synchronization
- Prometheus metrics endpoints
- Health and readiness checks
- Comprehensive test coverage (43 spec files, 821 tests)

### Architecture

- NestJS 11 with TypeScript 5.7
- One MTProto session → N backend consumers (dev/staging/prod)
- Standalone deployment (Docker port 3031, host 3032)
- Separate logical database per Postgres server (`<base>_ingestion`)
- TypeORM migrations (baseline + incremental)
- Anti-ban protections (flood handling, sleep windows, jitter)
