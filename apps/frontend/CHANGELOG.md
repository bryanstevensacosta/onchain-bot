# Changelog — frontend

Manual changelog (see root `RELEASE-FLOW.md`). Version history starts from v1.0.0.

## [Unreleased]

### Added

- Tramo 3 todo 7 (C-UX-01) market-data dashboard: `/market-data` page (chain catalog + detect-chain probe, provider health/latency table, address lookup with kind badge, 12-field compat snapshot, batch lookup up to 50 with per-item errors) and `/dexter` page (Dexter `/x` full-scan and `/c` chart lookup over market-data HTTP, no bot token), both behind the same-origin `/market-data-api` proxy (vite dev → `:4000`, staging `:4001`, prod `:4002` via `MARKET_DATA_PROXY_TARGET`/`VITE_MARKET_DATA_URL`) with TanStack polling (chains 30s, providers 15s, lookups on-demand) and empty states on API down. Playwright `e2e/market-data.spec.ts` (7 tests). Prod/staging nginx locations added but flagged deploy follow-up (todo 8: upstream service not deployed yet). (feat/mega-refactor-tramos)

### Changed

- Tramo 3 todo 6 (R-4/G-18) legacy rename: `ENDPOINTS.enrichment` moved from `/token/market-data/*` to `/token/enrichment/*` (backend keeps a temporary 307 redirect for one version); new `endpoints-enrichment.test.ts` pins the new paths + asserts zero legacy paths. (feat/mega-refactor-tramos)

### Changed

- P41 API prefix migration (T2 todo 13 Fase 2): feed fetchers moved to new prefixes (`/feed-publisher/*`, `/feed-threads-publisher/*`, `/feed-filters/*`); per-channel `/crypto-news/sources/:channelId/filters` CRUD stays (P41 exclusion). Dev `vite.config.ts` + prod `nginx.conf` + staging `nginx.staging.conf` proxy old+new side by side with coherence (vite prefix set == nginx location set x env); `ops/backups` untouched. Old paths still served until cutover todo 11. (feat/mega-refactor-tramos)

### Added

- `/templates` route: per-template dashboard (source picker, calls, 5+5 ranking, 30D/7D/1D top callers, extended config, avatars) + Playwright e2e. (feat/mega-refactor-tramos)
- Feed-publisher control-plane wiring: queue stats strip (`GET /feed-api/api/queue/stats`), matching flags + `pipeline-mode` badge, LLM config over migrated paths, scheduling catalog over `/feed-api/api/scheduling/*`, threads 501 stub section, and the `/feed-api` dev proxy. (feat/mega-refactor-tramos)

### Changed

- Scheduling slice renamed `feed-ads` -> `feed-scheduling` (English naming). (feat/mega-refactor-tramos)

### Fixed

- Crypto-news sources pinned to `?type=crypto-news` (no longer list kol). (feat/mega-refactor-tramos)

### Note

- `/templates` works in dev only until `/kol-api` is mirrored in prod/staging nginx. (feat/mega-refactor-tramos)

## [1.2.0] - 2026-09-24

### Changed

- Newsroom pinned to `type=crypto-news` (+ prompt-playground). (PR #247)
- KOL page + sources read from the feed API. (PR #247)
- `nginx.staging.conf` twin upstream. (PR #247)

## [1.1.0] - 2026-09-16

### Added

- `/threads` page: keywords, per-channel content filters, queue + health + toggles, blocked list, LLM config, prompt templates, backed by `threads-publisher` hooks (10s polls, no bare query keys). (PR #227)

## [1.0.2] - 2026-09-15

### Added

- Browser tab title per environment (Dev / Stage / Prod Onchain Bot). (PR #217)

### Removed

- Matching health badge from the Queue section (Start/Stop buttons already convey state). (PR #217)

### Fixed

- Staging bundle no longer identifies as prod (`VITE_APP_ENV` baked at build). (PR #217)

## [1.0.1] - 2026-09-12

### Added

- Pipeline health status badge on crypto-news page showing real-time scheduler state (LOADING/UNKNOWN/ON-OFF) with 15-second polling. Never crashes on 404 (tolerates old backend). (PR #203)
- `useMatchingHealth` hook for consuming pipeline health API (`GET /crypto-news/matching/health`). (PR #203)

### Fixed

- Deprecated `matchingEnabled` field removed from LLM config types (backend no longer returns it). (PR #203)

## [1.0.0] - 2026-09-11

**Baseline release**: Version reset for consistency across monorepo. This is the first official release with all apps aligned at v1.0.0.

### Features

- React 18 + Vite 5 dashboard with Feature-Sliced Design architecture
- Real-time WebSocket updates for pipeline events
- Token explorer with canonical calls and market snapshots
- KOL management with reputation scoring and lifecycle controls
- Crypto-news hub with messages, queue, keywords, blacklist, and LLM config
- Crypto-news ads manager with staged media protocol
- Content filters UI with live preview
- Settings management with presets
- Call tracking with milestone notifications
- Comprehensive test coverage (23 spec files, Vitest)

### Architecture

- TanStack Query v5 for server state management
- Socket.IO client for real-time updates
- Direct ingestion-service integration for crypto-news data
- Tailwind CSS 3.4 utility-first styling
- React Router v6 with 6 routes
- Nginx production deployment with per-prefix proxying

### UI/UX

- Dark mode slate-950 theme
- Responsive layout with mobile support
- Live feed with 50-item ring buffer
- Pagination (client-side)
- Clickable URLs with Telegram entity formatting
- Link previews with OG image display
- Media lightbox with keyboard navigation
- Toast notifications for actions
