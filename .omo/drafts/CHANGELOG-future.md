# FUTURE CHANGELOG — mega-refactor Tramo 1 (kol-system)

> Borrador para cuando la rama `feat/mega-refactor-tramos` se mergee a `dev` (vía PR) y luego a `master` con releases por app (ver `RELEASE-FLOW.md`). NO commitear a `CHANGELOG.md` aún.
> Generado 2026-09-25 desde 51 commits + AGENTS + diff (+46.103/−160, 328 ficheros).

## kol-system — NEW APP `v0.1.0` (crear `apps/kol-system/CHANGELOG.md`)

### Added

- Nueva app NestJS 11 `@onchain-bot/kol-system` (`:3050/3051/3052`): pipeline KOL por mención sin dedup — ingestion SSE-only kol, extraction contrato×mención, parsing 1:1, normalization índice sin merge, enrichment dual-port, snapshot 4 timestamps, scoring v1 configurable por template, templates CORE, approval, publishing multi-bot, tracking first-seen.
- Templates: CRUD + `kolSourceIds` + `scoring_config` + catálogo `telegram_bots` cifrados (AES-256-GCM) con canal admin-verificado + seed `vip-calls` (dashboard-only).
- Rankings: `GET /api/kol-rankings?window=30d|7d|1d&sort=...` + `kol_window_stats` por cron + rating +5x.
- Threads stub 501 (des-stubbeo en Tramo 2).
- Envs: `KOL_SYSTEM_*`, `TEMPLATE_ORCHESTRATOR_ENABLED`, `ENCRYPTION_KEY` (por env), `INGESTION_TELEGRAM_*`, `onchain_bot_kol_system[_staging]` (una DB por app).

## ingestion-telegram — `v1.3.0` (menor: avatar + naming)

### Added

- Módulo avatar permanente: `GET /api/kol-avatar/:channelId` (público, placeholder 200) + `POST .../refresh` (protegido, único re-fetch); fetch-once al alta, excluido del janitor 72h, bajo flood-guard `kol-avatar`; `avatarUrl` en `GET /api/feed/sources`; migración `1790300000000-KolAvatarColumns`.

### Changed

- Docs: `twin` → staging ingestion (`ingestion-telegram-staging`).

## backend — `v1.4.0` (menor: P10 + deprecación)

### Fixed

- Cola crypto-news solo acepta crypto-news: pin `?type=crypto-news` en matching/cron/handler + drop client-side + guard SSE anti-kol.

### Deprecated

- `telegram/ingestion/kol/kol-ingestion.module.ts` → `apps/kol-system/src/ingestion/` (P18; vivo para dual-run, borrado en cutover).

## frontend — `v1.3.0` (menor: templates + type-pin)

### Added

- Ruta `/templates`: dashboard por template (picker sources, calls, ranking 5+5, top-callers 30D/7D/1D, config extendida, avatares) + e2e Playwright.

### Fixed

- Crypto-news sources pineadas a `?type=crypto-news` (ya no listan kol).

### Note

- `/templates` solo funciona en dev hasta espejar `/kol-api` en nginx prod/staging.
