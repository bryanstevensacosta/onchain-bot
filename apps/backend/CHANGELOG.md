# Changelog — backend

Manual changelog (see root `RELEASE-FLOW.md`). Version history starts from v1.0.0.

## [Unreleased]

### Added

- P41 API prefix migration dual-serve (T2 todo 13 Fase 1): every feed controller serves old+new (`crypto-news-publisher/*` + `feed-publisher/*`, `crypto-news-ads/*` + `crypto-news-scheduling/*` + `feed-scheduling/*`, `threads-publisher/*` + `feed-threads-publisher/*`, `crypto-news/matching` + `feed-matching`, new `FeedFiltersController` on `feed-filters/*` delegating to the same filter use-cases). Old paths intact; cutover todo 11 drops them. `ops/backups` kept; backend does NOT adopt `feed-sources`. (feat/mega-refactor-tramos)

### Fixed

- Crypto-news queue accepts crypto-news only: `?type=crypto-news` pin in matching/cron/handler + client-side drop + anti-kol SSE guard. (feat/mega-refactor-tramos)

### Deprecated

- `telegram/ingestion/kol/kol-ingestion.module.ts` → `apps/kol-system/src/ingestion/` (P18; live for dual-run, deleted at cutover). (feat/mega-refactor-tramos)

## [1.3.0] - 2026-09-24

### Added

- Feed-unification consumption: backend reads ingestion-telegram `/api/feed/*` via HTTP identity client; KolController legacy routes now return 501 with feed hints. (PR #245)
- Semantic dedup wired in enqueue: duplicates persist as BLOCKED with fingerprint stored on publish, fail-open everywhere. (PR #245)

### Removed

- BREAKING: DROP `kols` table replica — KOL identity reads live from the ingestion feed only. (PR #245)
- SSE registration removed from the adapter (open stream, no gate). (PR #245)
- Dual-path docs and dual-write removed per plan. (PR #245)

## [1.2.0] - 2026-09-16

### Added

- Threads publisher BC: 8 `threads_*` tables, enqueue/drain core (cap 100, dailyCap 60, drain every 10 min, 24h TTL), Threads Graph API adapter (2-step post + poll, 500-char guard, media skipped), 5 management controllers with prod LLM guard, integration matching over ingestion SSE with zero `telegram/` changes. (PR #227)

### Fixed

- Preserve line breaks from LLM `<br>` output and harden prompt. (PR #225)

## [1.1.0] - 2026-09-15

### Added

- Continuation messages thread as replies to the primary post. (PR #219)
- Whole-bullet splits with double line breaks for readability; ellipsis only on real mid-block cuts. (PR #219)
- Telegram albums publish complete via `sendMediaGroup` with sibling-photo merge instead of a single photo. (PR #222)

### Fixed

- Long photo/video captions (>1024) and texts (>4096) no longer silently truncated: overflow follows as continuation message(s). (PR #219)
- Album merge keeps original per-message media indexes so file resolution hits `{messageId}_{index}` files. (PR #223)

## [1.0.1] - 2026-09-12

### Fixed

- Crypto-news pipeline outage caused by host firewall blocking ingestion fetch. Backends now use container DNS (`http://onchain-bot-ingestion:3031`) to bypass host network layer. (PR #203)
- Silent scheduler failures now visible via `GET /crypto-news/matching/health` endpoint (6-field health state: enabled, lastTickAt, lastFetchOk, consecutiveFetchFailures, lastEnqueuedAt, queuePending). (PR #203)
- Firewall rules now declarative in `bootstrap-droplet.sh` (idempotent DOCKER-USER ACCEPTs + socat systemd persistence). (PR #203)

### Deprecated

- `matchingEnabled` field removed from `GET /crypto-news-publisher/llm/config` read response (single source of truth is `crypto_news_matching_config` table). PATCH writes with this field now return HTTP 400 with migration hint. (PR #203)

### Added

- Smoke probes 6-7 for matching config and pipeline health (deploy gates now verify `/7` instead of `/5`). (PR #203)

## [1.0.0] - 2026-09-11

**Baseline release**: Version reset for consistency across monorepo. This is the first official release with all apps aligned at v1.0.0.

### Features

- NestJS 11 alpha-call pipeline (extraction → normalization → enrichment → classification → scoring → approval → publishing)
- Centralized SSE ingestion from standalone ingestion-service
- Crypto-news publisher with LLM integration, keywords, blacklist, and content filters
- Crypto-news ads system with rotation and media library
- VIP calls publishing via Telegram Bot API with milestone achievements
- Call tracking and performance evaluation system
- KOL reputation scoring with configurable formulas
- Chain-Dexter bot for Telegram-based token scanning
- Multi-provider market data enrichment (13 providers)
- Settings management with presets and audit logging
- WebSocket real-time updates for pipeline events

### Architecture

- DDD/Hexagonal architecture with 22 active modules
- Event-driven pipeline with domain events
- TypeORM with migrations for staging/prod (synchronize for dev)
- Redis caching and cursor tracking
- Prometheus metrics endpoints
- Comprehensive test coverage (170 spec files, 1969 tests)
