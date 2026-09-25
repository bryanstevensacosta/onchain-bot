# apps/frontend/ — React/Vite Dashboard (Feature-Sliced Design)

> Verified 2026-09-04 against code. v1.2.0 (source of truth: apps/frontend/package.json + CHANGELOG; verified 2026-09-24).

## OVERVIEW

React 18.3 + Vite 5 + TanStack Query v5 + socket.io-client 4.8 + Tailwind CSS 3.4 + React Router v6.
Strict FSD. Dev `:5173` (strictPort); prod is nginx static + per-prefix proxy to `backend:3030`.

## STRUCTURE

```
src/
├── app/ {entry.tsx (createRoot), index.tsx (providers), router/routes.tsx (9 routes),
│         layouts/root-layout.tsx, providers/{query,socket}-provider.tsx, styles/}
├── pages/ {dashboard (KpiCards + IngestionHealth + LiveFeed + TopTokens + TrackedCalls), tokens-explorer, token-detail (displayName fallback canonical→snapshot→ticker; ContractAddress + copy; gauge + breakdown + snapshot + canonical), kols (rows + lifecycle/backfill/recompute/formula controls), crypto-news (550-line hub: messages + queue + keywords + ads + filters + llm-config + lightbox + album grouping), playground, threads, template-dashboard (thin wrapper → widgets/template-dashboard), ops (replay/filters/presets tabs)}
├── widgets/ {kpi-cards, live-feed, top-tokens-table, kol-leaderboard, tracked-calls, ingestion-health,
│           template-dashboard (TemplateDashboard: template picker + SourceMultiSelect + CallsTable + PerformanceRanking + TopCallersStrip + TemplateConfigSection + KolAvatar)}
├── features/ (11) {add-kol, add-crypto-news-source, set-kol-lifecycle,
│              replay-message, reprocess-rejected, kol-score-formula, recompute-kol-reputation,
│              settings (filters/presets tabs, presets = named settings snapshots),
│              crypto-news-publisher (queue 10 s polling, backend cap 500; keywords/phrases/blacklist/llm-config),
│              crypto-news-ads (1 473-line manager: staged media protocol create→upload→PATCH format; `expiresAt: null` = explicit clear),
│              crypto-news-filters (regex pattern/replacement/flags default `gi`/priority + live preview)}
- Keywords support compound AND-groups, per-template binding, exact/substring modes (`KW_PAGE_SIZE` 5); phrases poll 10 s + guarded search + conflict-check mutation; presets create with empty snapshot; lightbox has arrow-key nav with wraparound.
- Publisher ops: `MatchingToggleButton` (start/stop with spinner + pulse dot), `BlockedPostsList` (BLOCKED filter + shared details modal), `PromptTemplates` (643 lines: model/vision/maxTokens/temperature/reasoning-effort forms).
- Blacklist mirrors keywords (910 lines: batch create, compound groups, per-source scope); ads poll 10 s; `KolReputationView` carries full outcome metrics (x2/x5/x10/x50, rug50/rug80, neutral) + `isTrusted/isSuspicious`; copy buttons with Spanish aria-labels (`Copiar contrato`).
- `CanonicalTokenCallView` keeps per-source `messageIds` + metrics + confidence; `TokenScoreView` keeps legacy `classifiedAt?` + `avgKolReputation`.
- Compound modal: client-generated row IDs (`generateId()`), AND-grouped phrase rows with per-row case/mode/media/template binding; source invalidation is broad (`cryptoNewsKeys.all`).
├── entities/ (12) {kol, kol-reputation, canonical-call, token-score, token-classification,
│              token-snapshot, filter-decision, published-call, tracked-call, crypto-news, dashboard,
│              template (TemplateView/TemplateCallRow/KolRankingRow/KolSourceOption + templateKeys + 6 hooks + pure helpers)}
├── shared/ {api/{http-client, endpoints, settings-endpoints}, config/env.ts, lib/{format, signalLabels, render-telegram-entities, use-pagination, uuid}, realtime/{events, socket, use-event-stream}, ui/{button, badge, card, modal, token-image, gauges, lightbox, chain-icon, bonding-curve-progress}}
└── test/setup.ts (single `jest-dom/vitest` import)
```

Routes (`createBrowserRouter` — data-router API but NO loaders; Query owns server state):
`/`, `/tokens`, `/tokens/:chain/:address`, `/kols`, `/crypto-news`, `/playground`, `/threads`, `/templates`, `/ops`.
Nav has 8 links (Dashboard · Tokens · KOLs · News · Playground · Threads · Templates · Ops — README says 4, stale).
`/templates` (Tramo 1, kol-system): `TemplateDashboardPage` (`pages/template-dashboard/index.tsx`, thin wrapper) renders `TemplateDashboard` (`widgets/template-dashboard/ui/template-dashboard.tsx`): template picker (defaults to first template) → `SourceMultiSelect` (checkbox chips per KOL source, `Clear (all)` = empty = all sources; change PATCHes `kolSourceIds` via `useUpdateTemplateSources`, invalidates detail/calls/templates) → `CallsTable` + `PerformanceRanking` + `TopCallersStrip` + `TemplateConfigSection`. Calls are enriched client-side (rankings row joined with feed-source handle/title/url/avatarUrl, call row wins) then filtered by `filterCallsBySources`. Every widget degrades to an empty-state div on API error (never crashes; e2e pins `template-dashboard-empty`).
Kols rows show lifecycle/listening state + rep score with 0.7/0.3 tone bands; `SetKolLifecycleButton` per row. Page paginates 15/page with `lastIngestedAt` relative times; Activate/Deactivate buttons by status, Recompute per row (backfill removed 2026-09-24: `POST telegram-kol/identity/kols/:kolId/backfill` answers 501, no feed equivalent — trigger-backfill feature deleted). `AddKolModal` takes a bare Telegram ID/`@handle` (title/handle auto-resolved server-side), guards submit while pending, surfaces `mutation.error` inline. Score formula preset lives in `localStorage` (`useKolScoreFormula`) and is sent as `?formula=` on recompute.
Pagination is client-side only (`usePagination`: slices fetched arrays, clamps on shrink) — large lists transfer fully.
Modal convention (`AddKolModal`, `AddCryptoNewsSourceModal`): uncontrolled-close guard while pending, `mutation.reset()` on close, inline `mutation.error` alert; source modal validates `/^-100\d+$/` client-side. Settings tabs edit inline with staged `edits` map, grouped by filter `type`, invalidate `settingsFilterKeys.all` on success. Empty states in Spanish (`Cargando…`, `Sin snapshot de mercado`); null glyph is `—` (format lib).

## BACKEND CONTRACT (`shared/api/endpoints.ts` — source of truth)

**PRIMARY BACKEND** (`localhost:3030` in dev, `backend:3030` in prod):
Correctly scoped prefixes: `telegram-kol/identity`, `telegram-kol/reputation`, `token/intake/*`,
`token/normalization`, `token/market-data`, `token/classification`, `token/scoring`,
`token/vip-call-approval`, `token/honeypot`, `token/call-tracking`, `call-tracking`,
`vip-calls`, `crypto-news-publisher/*`, `crypto-news-ads/*`, `settings/*`,
`dashboard/kpis`, `ingestion/{config,health}`, `token/image/:chain/:address` (CDN fallback in `format.ts`).

**INGESTION-TELEGRAM — una instancia por env (per-env 2026-09-22)** (`/ingestion-api` same-origin → upstream por env):
**Cada frontend consulta SU ingestion (nunca el de otro env).** Rutas feed-unification (las viejas `/api/crypto-news/*` dan 404):

- `GET /ingestion-api/feed/messages?limit=50&type=kol|crypto-news` — recent feed messages with media (SQL-level `type` filter; 400 invalid; omitted = mixed legacy default)
- Newsroom (`/crypto-news`) + prompt-playground pin `type=crypto-news`; threads wrapper untouched/mixed.
- `GET /ingestion-api/feed/messages/channel/:channelId?limit=50` — messages by channel
- `GET /ingestion-api/feed/sources?type=crypto-news` — crypto-news sources only (type-pinned; bare = mixed kol + news legacy default)
- `GET /ingestion-api/feed/sources/active/ids?type=kol` — channel IDs only (kols page)
- `GET /ingestion-api/feed/stats` — statistics (totalMessages, totalSources, activeSources)
- `GET /ingestion-api/media/:channelId/:messageId/:index` — serve feed media files

| Env     | Frontend | Ingestion upstream (nginx/vite)                                                              |
| ------- | -------- | -------------------------------------------------------------------------------------------- |
| dev     | `:5173`  | vite `INGESTION_PROXY_TARGET` → `http://localhost:3031`                                      |
| staging | `:4173`  | `nginx.staging.conf` → `onchain-bot-ingestion-telegram-staging:3031` (staging, host `:3033`) |
| prod    | `:80`    | `nginx.conf` → `onchain-bot-ingestion-telegram:3031` (host `:3032`)                          |

**IMPORTANT:** Frontend queries its OWN env's ingestion-telegram DIRECTLY for feed data (no backend proxy).
Each backend also queries ITS ingestion via HTTP API — NO database replication, NO shared data.

**KOL-SYSTEM — Tramo 1 (kol-system `:3050` en dev)** (`/kol-api` same-origin → upstream kol-system; ver §PROXY):
Rutas per-template (`shared/api/endpoints.ts` `kolSystem`, consumidas por `entities/template/api/template-queries.ts`):

- `GET /kol-api/templates` — template list for the picker (`useTemplates`, 30 s polling)
- `GET /kol-api/templates/:id` — template detail/config (`useTemplateDetail`, 30 s, `enabled: !!id`)
- `GET /kol-api/templates/:id/rankings` — ranked mentions mapped to `TemplateCallRow` (`useTemplateCalls`, 10 s)
- `PATCH /kol-api/templates/:id/sources` — persist `kolSourceIds` array (`useUpdateTemplateSources` mutation)
- `GET /kol-api/kol-rankings?window=30d|7d|1d&sort=perf_desc|perf_asc|calls_desc` — KOL rankings (`useKolRankings`, 15 s; window selector + perf halves + top-callers strip share it)
- `GET /ingestion-api/kol-avatar/:channelId` — KOL avatar file-or-placeholder (contrato P19/P4 con ingestion-telegram; `avatarSrcFor()` en `entities/template/model/helpers.ts` resuelve `avatarUrl → /ingestion-api/kol-avatar/:channelId → TEMPLATE_AVATAR_PLACEHOLDER`; `KolAvatar` muestra inicial del handle si falla/404)
- `ENDPOINTS.kolSystem.templatePending` definido pero SIN fetcher (pending-approvals sin UI — no llamar hasta cablearlo).

⚠️ Frontend README §3 is stale (`/kols`, `/token/token-gating/*` — neither exists). Trust `endpoints.ts`.

## DEAD URLS (verified 404 — fix, don't re-encode)

1. ~~`kols.backfill` → `/telegram-kol/ingestion/kols/:id/backfill` — RESOLVED 2026-09-24: path had already been corrected to `POST telegram-kol/identity/kols/:kolId/backfill`, but the backend answers 501 on all identity routes (identity moved to the feed API, no backfill equivalent) — trigger-backfill feature + `ENDPOINTS.kols.backfill` deleted, zero callers remain.~~
2. `publishing.byToken` → `/vip-calls/calls/:chain/:address` — backend has no such route. Currently ZERO usages (dead definition, not dead page) — remove it or wire the per-token published lookup.
3. `dashboard.kpis` → `/dashboard/kpis` — backend module commented out (backend gap: dashboard unwired). KpiCards degrades without crashing: KOLs card falls back to ingestion-health (`activeChannels`/`maxSafeChannels`), the rest render `0`/`0.0%`. Fix the backend wiring, not the widget.
4. `filters.reprocessOne|reprocessBatch|decisionsRejectedVerify` — backend vip-call-approval controller has only 5 routes (apply + decisions ×4). The reprocess-rejected feature is client-complete (diagnostics table + per-row/btach mutations invalidating `rejected-diagnostics` + decisions) but server-missing. Its `useRejectedDiagnostics` key is a raw array, not a shared factory (style deviation).
5. `llm-config-api.ts` uses `/api/crypto-news-publisher/*` prefix — vite dev proxies `/api`, but **nginx prod has no `/api` location** → LLM config broken in prod only.
6. ~~`/crypto-news/filters/*` unproxied — RESOLVED: filters moved to backend, messages/sources/media moved to ingestion-telegram `/ingestion-api` prefix.~~

**RESOLVED (feed-unification + per-env):** ~~7. Frontend crypto-news queries still point to backend~~ — now `GET /ingestion-api/feed/*` same-origin (vite dev → `:3031`, prod nginx → singleton, staging nginx → staging ingestion). ~~8. Content filters API stays in backend~~ — confirmed: filter CRUD (`/crypto-news/sources/:channelId/filters`, `/crypto-news/filters/:id/*`) stays in backend; ingestion stores RAW, backend matches on-read (Opción A).

## POLLING (verified `refetchInterval`)

scores/decisions/published 5 s · failed 15 s · canonical 10 s · kols/reputation/tracked/dashboard 30 s (reputation `refetchIntervalInBackground: false`) · crypto-news 15/30 s. Token-detail composes canonical + score + snapshot byToken (all alive).

## REALTIME (`shared/realtime/`)

`WS_EVENTS` mirrors real backend wire names (`vip-call-approval.decision.applied`, `publishing.telegram.published`…).
LiveFeed subscribes to `ScoringScored` + `FiltersDecision` + `NormalizationNormalized`.
Singleton socket (`getSocket`), transports `websocket`→`polling` fallback, reconnect 5 attempts 1 s→30 s max, `hello` logged in DEV only. `ROOMS` map (chain:solana|evm, verdict:approved|rejected, published:all, score:>=70) with `joinRoom`/`leaveRoom` emits. `useEventStream(event, handler, enabled)` subscribes/unsubscribes in `useEffect`.
Socket connects to `WS_URL` (`VITE_WS_URL` ?? `localhost:3030`); nginx holds WS 24 h (`proxy_read_timeout 86400`).
LiveFeed detail: `MAX_ITEMS` 50 ring buffer, tabs all/scored/decision with counts, joins `chain:solana`+`chain:evm` on mount, seeds history via `fetchRecentDecisions(10)` with `${at}-${kind}-${address}` dedup, score tone bands 70/50/30, timestamps from payload fields (`scoredAt/decidedAt/lastSeenAt`, `Date.now()` fallback) — README's "`hace 0s` hardcoded" is stale, fixed.
Tokens-explorer is decision-driven (all/approved/rejected tabs over `useDecisions` + score/canonical/snapshot joins, `usePagination`, click → token-detail).

`ScoreTier` alineado con backend (`STRONG|DECENT|NEUTRAL|RISKY|AVOID`; legacy `GOOD|POOR|FAILED` kept compat) + `tierTone()`/`classificationTone()` con fallback `gray` (Carril 1, gap 7 resolved).
⚠️ `TelegramMessageIngestedEvent` carries `text` — verify backend never emits raw text over WS (fix-1); backend `EVENT_MAP` funnels everything through `server.emit`.

## HTTP LAYER (fetch, NOT axios)

`shared/api/http-client.ts`: native `fetch` + `HttpError{status, body}` — verbs GET/POST/PATCH/DELETE + `httpPostForm` (uploads); no PUT, no interceptors. `QueryClient` instance held in `useState` (stable). `SocketProvider` renders the WS ●/○ badge. Base URLs from `shared/config/env.ts`:

- `VITE_API_BASE_URL` (backend) — default `''` (same-origin in Docker; unset locally)
- `VITE_WS_URL` (websocket) — default `http://localhost:3030`
- `VITE_APP_ENV` (environment) — default `development`, values: `development|staging|production`

No `VITE_INGESTION_BASE_URL` exists anywhere in `src` (verified by grep): feed reads go same-origin via `/ingestion-api/*` (vite dev proxies to `:3031`, prod/staging nginx rewrites `/ingestion-api/*` → `/api/*` on the per-env upstream).

Docker build sets all to `""` → same-origin in prod (nginx routes by prefix).

**Environment-Specific Behavior:**

- **Production (`VITE_APP_ENV=production`):** LLM toggle button HIDDEN in crypto-news publisher UI (LLM generation always enabled, enforced by backend safety guard)
- **Staging/Dev (`VITE_APP_ENV=staging|development`):** All 3 toggle buttons visible (matching, LLM, publishing)
- Backend safety guard: Rejects `PATCH /crypto-news-publisher/llm` with `llmEnabled` changes in production (400 error)

## PROXY (dev vs prod differ — mind the gaps)

**Dev (`vite.config.ts`):**

- Backend proxy (`localhost:3030`): `/api`, `/crypto-news-publisher`, `/crypto-news-ads`, `/crypto-news/matching`, `/socket.io` (ws:true)
- **Ingestion-telegram proxy (`INGESTION_PROXY_TARGET`, default `http://localhost:3031`):** `/ingestion-api/*` → rewrite `^/ingestion-api` → `/api`
- **Kol-system proxy (`KOL_SYSTEM_PROXY_TARGET`, default `http://localhost:3050`):** `/kol-api/*` → rewrite `^/kol-api` → `/api` (Tramo 1; `vite.config.ts:98-102`)
- **REMOVED:** `/crypto-news/(messages|sources|backfill|media)` regex — feed reads go via `/ingestion-api/feed/*`

**Prod (`nginx.conf`, staging: `nginx.staging.conf`):**

- Backend locations (`backend:3030`): dashboard, telegram-kol, vip-calls, token, ingestion, call-tracking, telegram, settings, kols, crypto-news-publisher, crypto-news-ads, socket.io
- **Ingestion-telegram location:** `/ingestion-api/` → rewrite → `/api/` on the per-env upstream: prod `onchain-bot-ingestion-telegram:3031` (`nginx.conf:252-258`), staging `onchain-bot-ingestion-telegram-staging:3031` (`nginx.staging.conf:256-260`, host `:3033`)
- ⚠️ **Kol-system location MISSING:** `nginx.conf`/`nginx.staging.conf` have NO `/kol-api/` block (verified by grep — solo existe en `vite.config.ts`). `/templates` works in dev only until prod deploy mirrors it (`/kol-api/` → rewrite → `/api/` on the kol-system upstream, dual-applied to both confs like `/ingestion-api/`).
- **REMOVED:** `/crypto-news/{messages,sources,media}` — now `/ingestion-api/feed/*`
- SPA fallback + gzip + security headers (`nosniff`, `DENY`, strict referrer) + 502 `@maintenance` JSON + `client_max_body_size 12m`

**Architecture note:** Feed data flows per env: Telegram → OWN ingestion-telegram DB → HTTP API → frontend (direct query, no backend middleman). Staging image bakes the staging upstream via `VITE_APP_ENV=staging` (`Dockerfile:27-35` re-declared ARG + `RUN if` copy; prod default path unchanged). Staging precondition: staging container MUST join `onchain-bot-staging-net` or the staging DNS name doesn't resolve. Drift guard: whoever edits the `/ingestion-api/` block dual-applies to both confs (see `nginx.staging.conf:244-255` owner note).

**Feed-reading pages:** `/crypto-news` (messages + queue + sources via `/ingestion-api/feed/*`), `/kols` (sources `?type=kol` for the AddKol flow).

## WIDGETS & LIB

- `KolLeaderboard`: presentational (rows in, no fetching), rank + score bands 0.7/0.4 + `totalMentions`/`x2Count`.
- Recompute mutation invalidates `reputationKeys.all` (leaderboard + cards refresh together).
- `renderFormattedText`: offset-clamped Telegram entity segments (bold/links) for news bodies.
- Primitives: `Button` (4 variants × 3 sizes, `clsx`, disabled styles), `Badge` (9 tones, default gray), `Card/CardTitle`, `Modal` (portal + Escape/backdrop, 3 sizes), gauges, `ChainIcon` (inline Solana/Ethereum SVGs), `lightbox`, `TokenImage`.
- Filter hooks invalidate narrowly (per-channel on create/update, broad on delete/toggle); `useFilters(channelId)` disabled until channel set.
- LLM config edits a string draft (`draftFromConfig`), model dropdown grouped by `ownedBy`; model shown for context (source of truth is the template).
- Publisher `QueueView` (504 lines): queue states PENDING/SCHEDULED/PUBLISHING/PUBLISHED/FAILED/BLOCKED with inline status colors, counters, cancel action, media preview with `isVideoPath` heuristic (`.bin/.mp4//video_//document`).
- `index.html`: `<html class="dark">`, slate-950 body, entry `src/app/entry.tsx`.
- Display mappings live in `shared/lib/signalLabels.ts` (RISK/HONEYPOT/FILTER*REASON/SCORING_FACTOR/RISK_LEVEL label + tone maps, `humanize` fallback, `signalLabel` strips `SIGNAL*`prefix) and`token-score/model/tier.ts` (`scoreTone`70/50/30 bands,`tierTone`). `ScoreGauge`+`ScoreBreakdown` (factor/delta/note) consume them.
- `TrackedCallsWidget`: `useTrackedCalls({limit: 20, hasMilestones?})` + milestones-only checkbox; MC@pub/MC-now/max-×/Δ-price columns.
- Crypto-news views mirror backend DTOs (message with `linkPreview*` + `formattingEntities` + `groupedId`; `ContentFilter` + create/update DTOs); key factory takes object params (`['crypto-news','messages',{limit,channelId}]`).
- `HolderConcentrationGauge`: Mobula segments (Top10>80, insiders>50, bundlers>30 warn) with hover tooltip, `—` without data; `LiquidityGauge` (locked/burned + RugCheck flag); `BondingCurveProgress`: pumpfun-aware (🎓 Graduated ≥99, bands 75+, null → `—`).
- Detail hooks (`useKol(id)`, `useKolReputation(id)`) use `enabled: !!id` guards; list hooks poll.
- Views mirror backend DTOs (`TokenSnapshotView` with RugCheck `locked/burnedPercent`, `primaryPair`, `completeness`; `PublishedCallView` importa `ScoreTier` de `@/shared/realtime/events` (duplicado eliminado, Carril 1); `GateAllowView{allowed, reasons[]}`).
- Config forms (`AdsRotationConfigForm`, LLM config) edit string drafts re-seeded from server only when upstream values actually change (no mid-edit clobber).
- Kols footer: `rangeStart–rangeEnd de total` + page counter (Spanish UI); empty state `No hay KOLs registrados`.
- `token-classification` is a chipless-fetch entity: types + `ClassificationChip` only (classifications arrive inside score/canonical payloads, never fetched directly).
- `AdHtmlPreview` (224 lines): sanitizing mini-renderer mirroring backend `telegram-html-sanitizer.ts` — Telegram HTML allowlist, tokenized rebuild as React elements, no `dangerouslySetInnerHTML`.
- `SourceMultiSelect`: empty ids = global scope (`All sources (global)` label).
- Template-dashboard widgets (`widgets/template-dashboard/ui/`, barrel `widgets/template-dashboard/index.ts`): `CallsTable` (ticker/`$` o address `aaaa…zzzz`, score, `formatMc` `$2.50M`, `timeAgo`, `trackingLabelFor` First-time/`Nx from last call`, expandable breakdown rows, testids `kol-calls-table`/`call-row-*`/`db-id-*`/`more-details-*`/`details-*`) + `PerformanceRanking` (top-10 en mitades 5+5 vía `splitRankingHalves`, toggle `perf_desc/asc` vía `togglePerfSort`, orden vía `sortRankings`, testids `kol-rankings-table`/`perf-half-left|right`/`perf-card-*`/`perf-sort-toggle`) + `TopCallersStrip` (top-10 por calls con selector `30d/7d/1d`, testids `top-callers-strip`/`window-selector`/`window-*`/`top-caller-*`) + `TemplateConfigSection` (read-only: sources `All sources|N selected`, score floor, gems `≥score · N pattern(s)` + lista, bot `botId ?? dashboard-only → channelTarget`, testids `template-config`/`config-*`) + `KolAvatar` (img 32px redonda u placeholder con iniciales, testids `avatar-img-*`/`avatar-placeholder-*`). Helpers puros en `entities/template/model/helpers.ts` (`filterCallsBySources` empty=all, `splitRankingHalves`, `sortRankings`, `togglePerfSort`, `trackingLabelFor`, `timeAgo`, `formatMc`, `avatarSrcFor`); tipos en `model/types.ts` (`TemplateView` con kolSourceIds/score-floor/gems/bot/target/canPublish, `TemplateCallRow` con campos anulables y arreglo breakdown, `KolRankingRow` caller/window/totalX/counts/display, `KolSourceOption` channelId/handle/title/avatarUrl/url).
- `uuid.generateId()`: `crypto.randomUUID()` with Math.random fallback for non-secure HTTP contexts.

## TESTS (31 files, vitest + Playwright e2e)

Co-located `*.test.{ts,tsx}` + `__tests__/` dirs, heaviest in crypto-news features (ads-manager 1900+ lines, crypto-news-page). `src/test/setup.ts` only. jsdom + testing-library/react in deps.
Template-dashboard: `entities/template/model/helpers.test.ts` (pure helpers: tracking/mc/timeAgo/filter/sort/halves/avatar) + `widgets/template-dashboard/ui/template-dashboard.test.tsx` (jsdom: calls First-time/Nx + db-ids, perf 5+5 halves + sort toggle, window selector + caller counts, config extended). E2E Playwright (`e2e/template-dashboard.spec.ts`, 6 tests con `/kol-api/**` + `/ingestion-api/**` mockeados: calls table, rankings por window, source-filter narrow/clear, halves 5+5 + sort + window + config, API-down empty states, avatar-404 placeholder) + `e2e/qa-screenshots.spec.ts` (legacy dashboard intact, mockea `/kol-api/templates*`). `playwright.config.ts` (`testDir e2e`, baseURL `:5174`, webServer `vite --port 5174`, `reuseExistingServer` fuera de CI); `vitest.config.ts` excluye `e2e/**`; `npm run test:e2e` (`@playwright/test` devDep).

## REMOVED DEPS (Carril 1 — cero imports verificado)

`recharts`, `zustand`, `lucide-react`, `zod` removidos de `package.json`. Se queda `msw` (devDep test-only vía `msw/node`, 2 suites threads-publisher). Emojis sirven como iconos; sin charts; sin client store; sin schema validation.

## CONVENTIONS

FSD downward-only (`app → pages → widgets → features → entities → shared`); per-slice `ui/api/model/index.ts`; `@/*` alias (tsconfig `baseUrl: ./src`); TanStack Query (`staleTime 5s`, `retry 1`, `refetchOnWindowFocus false`, per-hook `refetchInterval` polling); mutations invalidate on success; Tailwind only (+ per-BC `bc.*` color tokens in `tailwind.config.ts`: ingestion blue … publishing green); singleQuote + trailingComma prettier (`endOfLine auto`); `react-hooks/exhaustive-deps: warn`, unused-vars warn (`^_`).

- Replay (Ops) posts operator-pasted raw Telegram `text` to `POST token/intake/extraction/extract` — intentional admin path for raw text over HTTP (wire format mirrors backend `ExtractInput` DTO).
- Entity slice pattern: `api/<x>-queries.ts` (key factory `['entity', …]` as const + fetch fns with `?limit=` params) → `model/use-<x>.ts` (hooks) → `ui/` presentational → barrel `index.ts`.
- `TokenImage`: DexScreener CDN fallback (`/ds-data/tokens/{slug}/{address}.png`, evm→ethereum) → deterministic hash-colour placeholder with ticker initial (4 sizes xs–lg); gauges (`score`, `liquidity`, `holder-concentration`, `bonding-curve`) + `chain-icon` + `lightbox` live in shared/ui. Note two image paths: `format.tokenImageUrl` routes via backend proxy (`/token/image/…`, LRU + WebP), `TokenImage` falls back to DexScreener direct.

## DEPLOY

Multi-stage Dockerfile (node:22-bookworm build with `tsc -b && vite build` via root `build:frontend` → nginx:1.27-alpine static, `EXPOSE 80`, wget healthcheck). `.dockerignore` present. `CHANGELOG.md` at app root (hand-written, v1.2.0 latest — matches `package.json`, the version source of truth). **Per-env bake (T3):** `ARG VITE_APP_ENV` re-declared after the second FROM + `RUN if [ "$VITE_APP_ENV" = "staging" ]` copies `nginx.staging.conf` over `default.conf` (COPY can't expand ARG in source); prod tag builds without arg (singleton upstream intact), staging tag with `--build-arg VITE_APP_ENV=staging` (staging upstream). Verify baked images by `grep 'set $ingestion_api' /etc/nginx/conf.d/default.conf` (see `docs/deployment/staging-twin-channels.md` §3).

## COMMANDS

```bash
cd apps/frontend            # or root -w @onchain-bot/frontend
npm run dev                 # :5173 strict (root runs port-cleanup first)
npm run build               # tsc -b && vite build
npm run test | :watch       # vitest run | vitest
npm run test:e2e             # playwright e2e/ (vite :5174 webServer, reuseExistingServer fuera de CI)
npm run lint                # eslint src --fix (react+hooks+prettier)
npm run format              # prettier --write "src/**/*.{ts,tsx}"
```

## GAPS (verified)

1–6. **Dead URLs above** — 1 backfill RESOLVED (feature deleted); 2 byToken already removed (zero usages; per-token lookup lives at `call-tracking/tracked/:chain/:address`); 3 dashboard kpis already removed (KpiCards degrades + documented); 4 reprocess already removed (zero references); 5 `/api/*` prefix already gone (zero `/api/`-prefixed fetches; both prefixes proxied); 6 filters hole CLOSED 2026-09-24 (`PUT /crypto-news/filters/:id` fix + `/crypto-news/filters/` location in both nginx confs + vite). 7. ~~**ScoreTier mismatch**~~ **RESOLVED (Carril 1)**: union alineada a backend + legacy compat, `tierTone()`/`classificationTone()` con fallback `gray`. 8. **Frontend README §3 stale** (`/kols`, `/token/token-gating/*`, 4 links vs 6 routes, missing crypto-news/settings/ads/tracking groups). 9. **Fix-1 smell**: `TelegramMessageIngestedEvent.text` typed on the socket — confirm backend never emits it. 10. **From README, still true**: no error boundaries; no skeletons (plain `Cargando...`); ~~`Chain` duplicated between entities and `realtime/events.ts` (`ScoreTier` duplicate fixed, Carril 1)~~ **`Chain` unified**: no second export existed — 2 holdouts on bare `string` now import canonical `Chain` from `realtime/events.ts` (display keeps `Chain | string`). (README's "`hace 0s` hardcoded" is stale — timestamps come from payload since the LiveFeed rewrite.) 11. **`/kols` nginx location** with no frontend caller using bare `/kols/*` — legacy leftover (README-era routes); remove or document.

## NOTES

- Strict port: run from root (`predev` port-cleanup) or Vite exits.
- `@/` is frontend-only (tsconfig paths, not backend).
- `dist/` + `tsconfig.tsbuildinfo` existen en disco (build local) pero **no trackeados** (root `.gitignore` `**/dist/`) — nada que des-trackear.
