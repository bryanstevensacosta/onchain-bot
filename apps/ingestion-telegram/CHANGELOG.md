# Changelog — ingestion-telegram

Manual changelog (see root `RELEASE-FLOW.md`). Version history starts from v1.0.0.

## [Unreleased]

### Added

- Consolidated ingestion-telegram docs set (feat/mega-refactor-tramos): new plain-words English `DB.md` (databases per env + the 3 `telegram_feed_*` tables + columns, Redis keys, on-disk layouts, migration history) and `BC.md` (per-area what/how with verified paths, HTTP APIs with inputs/outputs, classes + technical names explained for core, feed, registry, stream, retention, media, avatar, shared, health/metrics/debug), plus a PURPOSE section in `AGENTS.md` naming what each of the 4 docs is for. Standing rule: the 4 docs are updated continuously with every behavior or schema change (Unreleased entry first, never batch-at-release).

- Full API-key auth (sec1): `GET /api/feed/*` + `/api/crypto-news/*` reads now require the key (dual-prefix parity), two-bucket in-memory rate limiting (60/min protected+writes, 300/min media/avatar, health trio + SSE exempt, 401 precedes 429), one structured `auth:access:decision` audit line per decision with pino-http redaction of both key transports, and the key-compromise drill (`docs/deployment/ingestion-api-key-compromise-drill.md`). (feat/mega-refactor-tramos)

- P41 API prefix migration dual-serve (T2 todo 13 Fase 1): `FeedController` + `SourcesController` serve old `api/crypto-news/*` alongside `api/feed/*` (same handlers). `feed-sources` scope lives ONLY here; backend keeps its `/crypto-news/sources/:channelId/filters` CRUD (no `feed-sources` in backend). Old paths drop at cutover todo 11. (feat/mega-refactor-tramos)

- Permanent avatar module: `GET /api/kol-avatar/:channelId` (public, 200 placeholder) + `POST .../refresh` (guarded, single re-fetch); fetch-once at registration, excluded from the 72h janitor, under the `kol-avatar` flood guard; `avatarUrl` in `GET /api/feed/sources`; migration `1790300000000-KolAvatarColumns`. (feat/mega-refactor-tramos)

- Kind-resolver + channel/group-only guard (central todo 11, P57/P57-bis): `GET /api/feed/sources/resolve?input=<@handle|id|t.me>` classifies via a single `client.getEntity()` (`User|Chat|Channel` className + `bot` flag → `channel|supergroup|group|user|bot|unknown`, `canSubscribe` flag; 400 on empty/invite-link input, 404 when unresolvable; protected by API key). Register + batch reject non-channel/group with an explicit 400 (all-or-nothing in batch; fail-open when MTProto is unreachable so real channels still register). Subscribe path skips stored user/bot rows (defense in depth for pre-guard rows). Resolver runs inside the shared flood guard (`entity-resolve` label, P29 reuse). Minimal P58 signal stored on the source row (`entity_kind`/`is_bot`, migration `1790400000000-EntityKindColumns`); the full centralized `metadata/` table is a separate follow-up track. (feat/mega-refactor-tramos)

- Avatar for all source types + t.me url + enriched SSE (central todo 12, P57): the kol-only avatar filter is removed — every registered source (kol AND crypto-news) gets a fetch-once avatar; new `POST /api/kol-avatar/backfill` catches up pre-avatar rows (only missing files hit MTProto, serialized under the P29 promise tail, per-row MTProto misses count as placeholder and never throw). Avatar filenames carry the handle (`{channelId}__{handle}.jpg`; legacy bare files migrate lazily with single-file-per-channel dedup, still served during rollout). New nullable `url` column on `telegram_feed_sources` (`https://t.me/<handle>`, NULL for handle-less channels; migration `1790500000000-SourceUrlColumn`; recomputed on register/batch/PATCH, exposed on every source view + resolve). SSE `message:telegram` frames now carry additive `handle`/`avatarUrl`/`sourceUrl` (read-only source lookup, fail-open to nulls; consumers filter on `messageType` only — kol-system/feed-publisher DTOs ignore unknown fields, no consumer changes needed). (feat/mega-refactor-tramos)

- Central channel-metadata BC absorbing avatar (P58, 2026-09-27): new `src/metadata/` module owning identity per Telegram id — `telegram_channel_metadata` table (migration `1790600000000-ChannelMetadata`: peer/kind/title/names/handle/usernames/about/flags/participants/avatar/photo-refs/fetch-status; `phone` stored-never-exposed via `select: false`, no DTO/log/index) + absorbed avatar fetch-serve (same fetch-once/promise-tail/filenames/dedupe, parity-pinned by `metadata-absorption.spec.ts`) + kind matrix (`metadata-kind.spec.ts`). New canonical routes `GET /api/metadata/:channelId` (identity view, never `phone`) + `GET .../avatar` + `POST .../refresh` + `POST .../backfill`. Registry slimmed to subscription (active/type): register/batch/PATCH dual-write identity via `MetadataService.adoptRegistryRow`; its identity columns are deprecated mirrors (deleted after staging green). SSE enrichment is metadata-first with registry fallback; feed/stream/media/core hold no local copies. Old `GET/POST /api/kol-avatar/*` routes keep serving identical bytes with `Deprecation`/`Sunset`/`Link` headers only (deletion after staging green). Guards pinned by `metadata-no-dup.spec.ts`. (feat/mega-refactor-tramos)

### Changed

- Media rename + uploads unification: `src/media/` → `src/feed-media/` (tsconfig alias + jest `moduleNameMapper` + TypeORM `data-source.ts` paths follow; imports updated in `app.module.ts`, `core/shared.module.ts`, `telegram-media-extractor`). Class names deliberately KEPT (`MediaModule`, `MediaController`, `MediaDownloaderService`, `FeedPathBuilder`): renaming them changes no runtime behavior and would widen the DI/spec blast radius for nothing. On-disk `uploads/crypto-news/media/` + `uploads/feed/*` merged into `uploads/feed-media/` (channel dirs preserved, zero collisions, file counts verified in `.omo/evidence/media-rename.log`); serve reads the unified home first and falls back to both legacy segments with one `media:serve:fallback` warn log per hit. `rewriteMediaFilePathPrefix` now maps both legacy prefixes to `feed-media`. `Dockerfile` mkdir and gap 26 resolved. (feat/mega-refactor-tramos)

- Feed rename (code-level): `crypto_news_*` tables → `telegram_feed_*` (`telegram_feed_sources/messages/message_media`, migrations `1790000000000`/`1790045326364`/`1790100000000`/`1790200000000`), on-disk media prefix `uploads/crypto-news/media` → `uploads/feed/media` (legacy paths rewritten by `feed-path-builder`), and transformer renames (`news-text-extractor` → `feed-text-extractor`, `news-message-transformer` → `feed-message-transformer`). (feat/mega-refactor-tramos)
- Docs: `twin` → staging ingestion (`ingestion-telegram-staging`). (feat/mega-refactor-tramos)
- Metadata symbols renamed `avatar` → `profile-photo` (canonical naming; routes/DB columns unchanged). (feat/mega-refactor-tramos)

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
