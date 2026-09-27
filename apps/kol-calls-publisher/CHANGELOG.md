# Changelog — kol-calls-publisher

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Unified delivery surface `src/target/` (threads-publisher Fase 2 todo 10, P38-bis per-binding config): `target = bot telegram via gateway OR publisher threads` (per-binding choice). `TargetModule` (@Global) binds `TargetDispatcherPort` → `TargetDispatcherService` (telegram legs via the telegram-bots-gateway with vault-id mapping, threads legs via `ThreadsPublisherHttpClient` POST `/threads-publisher/queue/enqueue` on `THREADS_PUBLISHER_URL`, default `http://localhost:4100`) plus `TargetHealthIndicator` (P21, now a `GET /api/health` component) and a `telegram-ports` barrel (the only sanctioned import path for the legacy ports until removal). Migrated callers: `PublishFromTemplateUseCase` + `ManualPublishUseCase` accept `target` (`telegram` default, unchanged path; `threads` dispatches via the target dispatcher with string-remoteId jobs) and import legacy ports through the barrel; `HealthController` reports `target: up`; `PublishingTemplate.targetBindings()` exposes the delivery surface as links (telegram today, threads when C1 un-stubbes; empty = dashboard-only). `src/telegram/` + threads stub deprecated (`@deprecated` headers, dual-leg only, removed at threads-publisher todo 11 — no deletion here). Caller-migration gate spec-pinned (adversarial broken-caller suite red-before/green-after).
- P51 split from kol-system (2026-09-26): new NestJS 11 app `@onchain-bot/kol-calls-publisher` (HTTP `:3060/:3061/:3062` dev/staging/prod, SAME logical DB `onchain_bot_kol_system[_staging]` initially, split later) with scoring, templates, approval and telegram publishing moved via `git mv` (no behavior change) plus a new upstream reader.
- `KolCallsModule`: `KolCallsClient` (paginated `GET /api/mentions|/api/snapshots`, keyed `GET /api/mentions/:id|/api/snapshots/:mentionId`, rankings read; `x-api-key` via `KOL_CALLS_API_KEY`; non-ok throws, never silent null) plus `KolCallsSyncService` (1-minute cron behind `KOL_CALLS_SYNC_ENABLED`, pages + joins by mention id, feeds the unchanged `ScoreTokenUseCase`; upstream failure skips the tick) plus `KolCallsHealthIndicator`.
- Composite `GET /api/health` with `kol-calls`, `database`, `scoring`, `templates`, `approval` and `publishing` components.
- `AvatarResolver` port (default `NoopAvatarResolver` → null avatars, dashboard placeholder): publisher-side replacement for the ingestion-side avatar service that stayed in kol-calls.
- Envs: `KOL_CALLS_PUBLISHER_*` settings plus `KOL_CALLS_URL` / `KOL_CALLS_API_KEY` upstream wiring and tracked `.env.development` / `.env.staging.template` / `.env.production.template` placeholders with no secrets.

Test tally (2026-09-26): 63 suites / 235 tests green (46 moved byte-identical, 14 shared copies, 3 new contract/sync/health suites + health spec); `tsc --noEmit` clean; `nest build` clean; boot smoke (`:3060` health composite + `vip-calls` seed + approvals/publishing/threads-501 verified by curl).
