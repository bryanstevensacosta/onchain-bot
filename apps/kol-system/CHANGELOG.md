# Changelog — kol-system

Manual changelog (see root `RELEASE-FLOW.md`). Version history starts from v0.1.0.

## [Unreleased]

### Added

- New NestJS 11 app `@onchain-bot/kol-system` (`:3050/3051/3052`): per-mention KOL pipeline with no dedup — SSE-only kol ingestion, contract-per-mention extraction, 1:1 parsing, merge-free mention-index normalization, dual-port enrichment, 4-timestamp snapshots, per-template configurable scoring v1, CORE templates, approval, multi-bot publishing, first-seen tracking. (feat/mega-refactor-tramos)
- Templates: CRUD + `kolSourceIds` + `scoring_config` + encrypted `telegram_bots` catalog (AES-256-GCM) with admin-verified channel + `vip-calls` seed (dashboard-only). (feat/mega-refactor-tramos)
- Rankings: `GET /api/kol-rankings?window=30d|7d|1d&sort=...` + cron-fed `kol_window_stats` + 5x rating. (feat/mega-refactor-tramos)
- Threads 501 stub (un-stubbed in Tramo 2). (feat/mega-refactor-tramos)
- Envs: `KOL_SYSTEM_*`, `TEMPLATE_ORCHESTRATOR_ENABLED`, per-env `ENCRYPTION_KEY`, `INGESTION_TELEGRAM_*`, `onchain_bot_kol_system[_staging]` (one DB per app). (feat/mega-refactor-tramos)
