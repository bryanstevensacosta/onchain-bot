# Changelog — backend

Manual changelog (see root `RELEASE-FLOW.md`). Version history starts from v1.0.0.

## [Unreleased]

(none yet)

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
