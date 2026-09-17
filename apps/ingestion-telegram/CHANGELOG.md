# Changelog — ingestion-service

Manual changelog (see root `RELEASE-FLOW.md`). Version history starts from v1.0.0.

## [Unreleased]

(none yet)

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
