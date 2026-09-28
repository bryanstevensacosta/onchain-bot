# Changelog — frontend

Manual changelog (see root `RELEASE-FLOW.md`). Version history starts from v1.0.0.

## [Unreleased]

### Changed

- `/profiles` merged into `/feed` as sessions (breaking UI change):
  `pages/profiles/ui/*` moved to `widgets/feed-sessions/ui/` (FSD:
  pages cannot import from other pages) and rendered at the top of
  `FeedPage` as `FeedSessionsSection`: sticky header
  `[Session: <name>]` (session picker + `template: <name>|Ad-hoc` +
  Manage Sessions button) + sticky tab menu
  (sources|keywords|queue|target|filters|llm) + recent with status
  badges. Legacy `/profiles` answers `<Navigate to="/feed" replace />`
  so old bookmarks keep working; nav drops the Profiles link (10 links
  left); `pages/profiles/index.tsx` is a deprecated redirect stub.
  User-facing labels renamed profiles→sessions/templates (entity layer
  `entities/profile`, hooks, testids aside, API contract untouched;
  session testids renamed `sessions-*`/`session-*`). Feed source filter
  select gains `aria-label="Filter by source"` (was positional
  `combobox[0]` in specs, now displaced by the session picker). Tests:
  `widgets/feed-sessions/__tests__/feed-sessions.test.tsx` (moved +
  renamed, + Ad-hoc/template-bound template-name cases) +
  `pages/feed/__tests__/feed-page.test.tsx` sessions section (header +
  template + tabs render, empty state; `@/entities/profile` mocked) +
  Playwright `e2e/feed-sessions.spec.ts` (renamed, 6 flows on `/feed` +
  redirect test + `feed-sessions.png` screenshot).
  (feat/mega-refactor-tramos)

### Added

- Profiles UI on `/profiles` (Tramo 2, todo 16): publishing profiles are
  feed-publisher sessions (one tab = one session, P34) with content
  templates as creation-time starting points. Sticky header
  `[Profile: <name>]` (profile picker + Manage Profile button) + sticky
  tab menu (sources|keywords|queue|target|filters|llm). Manage Profile
  modal validates lowercase-dash names, previews the normalized id
  (dedup-friendly, mirrors backend `slugify`), loads a template or runs
  ad-hoc, and lists existing profiles with activate/deactivate/delete.
  Sources tab: global sources with per-profile toggles (toggles only).
  Keywords tab: paginated preview tables (allowed / blocked / compound
  AND-groups, 5 per page). Queue tab: session queue entries + stats
  strip. Target tab: telegram/threads bindings + matching/publishing/llm
  switches with canConsume/canPublish badges. Filters tab: per-source
  filter list with toggles + server-side preview with RAW/filtered badge.
  LLM tab: global llm config + pipeline flags mode. Recent messages show
  a 3-line clamp with per-message status badges from the new status
  endpoint (Not matched / Pending to publish / Blocked by … / Published
  / Failed / Not found) + a fixed scrollable details modal with reasons.
  Profile names render as React text (XSS-safe). Tests:
  `entities/profile/model/profile-helpers.test.ts` (normalize/validate/
  badge tones/pagination/compound split) +
  `pages/profiles/__tests__/profiles.test.tsx` (header/tabs/sticky/
  validation/XSS/badges/modal/keywords/llm/sources) + Playwright
  `e2e/profiles.spec.ts` (5 flows, `/feed-api/**` + `/ingestion-api/**`
  mocked). (feat/mega-refactor-tramos)

### Changed

- UI route renamed `/crypto-news` -> `/feed` (breaking UI change):
  nav label `News` -> `Feed`, page heading `Crypto News` -> `Feed`,
  legacy `/crypto-news` answers `<Navigate to="/feed" replace />` so old
  bookmarks keep working. Backend/API surface untouched on purpose:
  `type=crypto-news`, `/crypto-news/*` filter + publisher + scheduling
  prefixes, `['crypto-news', …]` query keys and `uploads/crypto-news/`
  paths stay as-is (backend contract, not UI route). E2E
  `feed-publisher.spec.ts` moved to `/feed` + new legacy-redirect test.
  (feat/mega-refactor-tramos)

### Added

- Scanner search modal on `/dexter`: `ScanSearchModal`
  (`pages/dexter/scan-search-modal.tsx`) opened from the scanner search box
  (`dexter-open-modal`); dark blurred backdrop (`bg-black/70
backdrop-blur-sm`), centered panel (`role=dialog aria-modal`), focus trap
  (Tab cycles, autofocus on open, focus restored on close), Esc +
  backdrop-click + close-button dismiss. Recent searches section
  (`use-recent-scans`, `localStorage dexter:recent-scans:v1`, max 10, dedup
  by normalized query, clear-all button, click re-runs); results area reuses
  `ScanResultView` (FullScanCard/ChartCard, now in `scan-views.tsx` shared by
  page + modal; page hides inline results while the modal is open so testids
  never duplicate). Recent items render as React text (XSS-safe, no
  `dangerouslySetInnerHTML`). Tests: `scan-search-modal.test.tsx`
  (open/close/recent persist/dedup-cap/clear/XSS) + Playwright
  `e2e/scan-modal.spec.ts` (open → search → reopen shows recent).
  (feat/mega-refactor-tramos)

### Added

- Dexter bot binding UI on `/dexter`: gateway inventory list with
  Link-as-target / Unlink actions plus Create-from-env-token; binding is
  gateway-exclusive 1:1 (one bot serves one app, locked bots cannot bind).
  (feat/mega-refactor-tramos)

- Dev holdings risk badge + dump-alert wiring: `MarketDataSnapshotView`
  gains `devWallets[]` + `devPctSupply`; new `DevRiskBadge` (green <5% /
  yellow 5-15% / red >=15% / gray N/A, wallet tooltip) +
  `useDevDumpAlert` (threshold 15% wiring point for tracking alerts)
  rendered on `/tokens/:chain/:address` (`dev-dump-alert`) and `/dexter`
  full-scan (`dexter-dev-pct` + `dexter-dev-alert`). Null-safe N/A, never
  crashes. Test: `dev-risk-badge.test.tsx` (N/A + tones + pct).
  (feat/mega-refactor-tramos)

- Supply fields on the `/dexter` full-scan card: FDV (fetched but never
  displayed until now) + Total / Circulating / Max supply cards from the
  extended `MarketDataSnapshotView` (null → `—` glyph, never crashes).
  Failing-first: real-values + null-safe cases in `dexter.test.tsx`.
  (feat/mega-refactor-tramos)

- Bare-address Dexter scans: pasting a lone contract (or `/x <address>` / `/c <address>`) no longer shows the usage error. `detectChainForAddress` (`entities/market-data/model/helpers.ts`) auto-fills the chain by format (0x + 40 hex → ethereum, base58 32-44 chars → solana) with a `dexter-detected-chain` notice; bare EVM adds a `dexter-ambiguous-hint` naming every EVM alternative (explicit retry for base/bsc/arbitrum/polygon, never a silent guess); garbage single tokens stay a parse error with bare-aware usage guidance. Failing-first: bare solana + bare EVM + ambiguous + invalid cases in `dexter.test.tsx` + `helpers.test.ts`. (feat/mega-refactor-tramos)

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
