# apps/frontend/ — React/Vite Dashboard (Feature-Sliced Design)

> Verified 2026-09-04 against code. v1.3.2.

## OVERVIEW

React 18.3 + Vite 5 + TanStack Query v5 + socket.io-client 4.8 + Tailwind CSS 3.4 + React Router v6.
Strict FSD. Dev `:5173` (strictPort); prod is nginx static + per-prefix proxy to `backend:3030`.

## STRUCTURE

```
src/
├── app/ {entry.tsx (createRoot), index.tsx (providers), router/routes.tsx (6 routes),
│         layouts/root-layout.tsx, providers/{query,socket}-provider.tsx, styles/}
├── pages/ {dashboard (KpiCards + IngestionHealth + LiveFeed + TopTokens + TrackedCalls), tokens-explorer, token-detail (displayName fallback canonical→snapshot→ticker; ContractAddress + copy; gauge + breakdown + snapshot + canonical), kols (rows + lifecycle/backfill/recompute/formula controls), crypto-news (550-line hub: messages + queue + keywords + ads + filters + llm-config + lightbox + album grouping), ops (replay/filters/presets tabs)}
├── widgets/ {kpi-cards, live-feed, top-tokens-table, kol-leaderboard, tracked-calls, ingestion-health}
├── features/ (12) {add-kol, add-crypto-news-source, trigger-backfill, set-kol-lifecycle,
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
├── entities/ (11) {kol, kol-reputation, canonical-call, token-score, token-classification,
│              token-snapshot, filter-decision, published-call, tracked-call, crypto-news, dashboard}
├── shared/ {api/{http-client, endpoints, settings-endpoints}, config/env.ts, lib/{format, signalLabels, render-telegram-entities, use-pagination, uuid}, realtime/{events, socket, use-event-stream}, ui/{button, badge, card, modal, token-image, gauges, lightbox, chain-icon, bonding-curve-progress}}
└── test/setup.ts (single `jest-dom/vitest` import)
```

Routes (`createBrowserRouter` — data-router API but NO loaders; Query owns server state):
`/`, `/tokens`, `/tokens/:chain/:address`, `/kols`, `/crypto-news`, `/ops`.
Nav has 5 links (Dashboard · Tokens · KOLs · News · Ops — README says 4, stale).
Kols rows show lifecycle/listening state + rep score with 0.7/0.3 tone bands; `BackfillButton` (gap 1: broken URL) and `SetKolLifecycleButton` per row. Page paginates 15/page with `lastIngestedAt` relative times; Activate/Deactivate buttons by status, Recompute + Backfill(limit 20) per row. `AddKolModal` takes a bare Telegram ID/`@handle` (title/handle auto-resolved server-side), guards submit while pending, surfaces `mutation.error` inline. Score formula preset lives in `localStorage` (`useKolScoreFormula`) and is sent as `?formula=` on recompute.
Pagination is client-side only (`usePagination`: slices fetched arrays, clamps on shrink) — large lists transfer fully.
Modal convention (`AddKolModal`, `AddCryptoNewsSourceModal`): uncontrolled-close guard while pending, `mutation.reset()` on close, inline `mutation.error` alert; source modal validates `/^-100\d+$/` client-side. Settings tabs edit inline with staged `edits` map, grouped by filter `type`, invalidate `settingsFilterKeys.all` on success. Empty states in Spanish (`Cargando…`, `Sin snapshot de mercado`); null glyph is `—` (format lib).

## BACKEND CONTRACT (`shared/api/endpoints.ts` — source of truth)

**PRIMARY BACKEND** (`localhost:3030` in dev, `backend:3030` in prod):
Correctly scoped prefixes: `telegram-kol/identity`, `telegram-kol/reputation`, `token/intake/*`,
`token/normalization`, `token/market-data`, `token/classification`, `token/scoring`,
`token/vip-call-approval`, `token/honeypot`, `token/call-tracking`, `call-tracking`,
`vip-calls`, `crypto-news-publisher/*`, `crypto-news-ads/*`, `settings/*`,
`dashboard/kpis`, `ingestion/{config,health}`, `token/image/:chain/:address` (CDN fallback in `format.ts`).

**INGESTION-SERVICE** (`localhost:3032` in dev, `onchain-bot-ingestion:3031` in prod):
**Per centralized architecture: Ingestion-service is the SINGLE SOURCE OF TRUTH for crypto-news data.**

- `GET /api/crypto-news/messages?limit=50` — recent crypto-news messages with media
- `GET /api/crypto-news/messages/channel/:channelId?limit=50` — messages by channel
- `GET /api/crypto-news/sources` — all active crypto-news sources
- `GET /api/crypto-news/sources/active/ids` — channel IDs only (backend consumer)
- `GET /api/crypto-news/stats` — statistics (totalMessages, totalSources, activeSources)
- `GET /api/media/:channelId/:messageId/:index` — serve crypto-news media files

**IMPORTANT:** Frontend queries ingestion-service DIRECTLY for crypto-news data (no backend proxy).
Backend staging/prod also query ingestion-service via HTTP API — NO database replication.

⚠️ Frontend README §3 is stale (`/kols`, `/token/token-gating/*` — neither exists). Trust `endpoints.ts`.

## DEAD URLS (verified 404 — fix, don't re-encode)

1. `kols.backfill` → `/telegram-kol/ingestion/kols/:id/backfill` — backend is `POST telegram-kol/identity/kols/:kolId/backfill` (wrong `ingestion` segment). trigger-backfill broken.
2. `publishing.byToken` → `/vip-calls/calls/:chain/:address` — backend has no such route. Currently ZERO usages (dead definition, not dead page) — remove it or wire the per-token published lookup.
3. `dashboard.kpis` → `/dashboard/kpis` — backend module commented out (backend gap: dashboard unwired). KpiCards degrades without crashing: KOLs card falls back to ingestion-health (`activeChannels`/`maxSafeChannels`), the rest render `0`/`0.0%`. Fix the backend wiring, not the widget.
4. `filters.reprocessOne|reprocessBatch|decisionsRejectedVerify` — backend vip-call-approval controller has only 5 routes (apply + decisions ×4). The reprocess-rejected feature is client-complete (diagnostics table + per-row/btach mutations invalidating `rejected-diagnostics` + decisions) but server-missing. Its `useRejectedDiagnostics` key is a raw array, not a shared factory (style deviation).
5. `llm-config-api.ts` uses `/api/crypto-news-publisher/*` prefix — vite dev proxies `/api`, but **nginx prod has no `/api` location** → LLM config broken in prod only.
6. ~~`/crypto-news/filters/*` unproxied — RESOLVED: filters moved to backend, messages/sources/media moved to ingestion-service `/ingestion-api` prefix.~~

**NEW GAPS AFTER CENTRALIZED ARCHITECTURE:** 7. **Frontend crypto-news queries still point to backend** (`/crypto-news/messages`) — MUST update to `/ingestion-api/crypto-news/messages` with ingestion-service base URL. 8. **Content filters API stays in backend** (`/crypto-news/sources/:channelId/filters`, `/crypto-news/filters/:id/*`) — backend manages filter CRUD, ingestion-service applies them during persistence.

## POLLING (verified `refetchInterval`)

scores/decisions/published 5 s · failed 15 s · canonical 10 s · kols/reputation/tracked/dashboard 30 s (reputation `refetchIntervalInBackground: false`) · crypto-news 15/30 s. Token-detail composes canonical + score + snapshot byToken (all alive).

## REALTIME (`shared/realtime/`)

`WS_EVENTS` mirrors real backend wire names (`vip-call-approval.decision.applied`, `publishing.telegram.published`…).
LiveFeed subscribes to `ScoringScored` + `FiltersDecision` + `NormalizationNormalized`.
Singleton socket (`getSocket`), transports `websocket`→`polling` fallback, reconnect 5 attempts 1 s→30 s max, `hello` logged in DEV only. `ROOMS` map (chain:solana|evm, verdict:approved|rejected, published:all, score:>=70) with `joinRoom`/`leaveRoom` emits. `useEventStream(event, handler, enabled)` subscribes/unsubscribes in `useEffect`.
Socket connects to `WS_URL` (`VITE_WS_URL` ?? `localhost:3030`); nginx holds WS 24 h (`proxy_read_timeout 86400`).
LiveFeed detail: `MAX_ITEMS` 50 ring buffer, tabs all/scored/decision with counts, joins `chain:solana`+`chain:evm` on mount, seeds history via `fetchRecentDecisions(10)` with `${at}-${kind}-${address}` dedup, score tone bands 70/50/30, timestamps from payload fields (`scoredAt/decidedAt/lastSeenAt`, `Date.now()` fallback) — README's "`hace 0s` hardcoded" is stale, fixed.
Tokens-explorer is decision-driven (all/approved/rejected tabs over `useDecisions` + score/canonical/snapshot joins, `usePagination`, click → token-detail).

⚠️ `ScoreTier` here = `STRONG|GOOD|NEUTRAL|POOR|FAILED` vs backend `STRONG|DECENT|NEUTRAL|RISKY|AVOID` — tier labels disagree (gap).
⚠️ `TelegramMessageIngestedEvent` carries `text` — verify backend never emits raw text over WS (fix-1); backend `EVENT_MAP` funnels everything through `server.emit`.

## HTTP LAYER (fetch, NOT axios)

`shared/api/http-client.ts`: native `fetch` + `HttpError{status, body}` — verbs GET/POST/PATCH/DELETE + `httpPostForm` (uploads); no PUT, no interceptors. `QueryClient` instance held in `useState` (stable). `SocketProvider` renders the WS ●/○ badge. Base URLs from `shared/config/env.ts`:

- `VITE_API_BASE_URL` (backend) — default `http://localhost:3030`
- `VITE_INGESTION_BASE_URL` (ingestion-service) — default `http://localhost:3032`
- `VITE_WS_URL` (websocket) — default `http://localhost:3030`
- `VITE_APP_ENV` (environment) — default `development`, values: `development|staging|production`

Docker build sets all to `""` → same-origin in prod (nginx routes by prefix).

**Environment-Specific Behavior:**

- **Production (`VITE_APP_ENV=production`):** LLM toggle button HIDDEN in crypto-news publisher UI (LLM generation always enabled, enforced by backend safety guard)
- **Staging/Dev (`VITE_APP_ENV=staging|development`):** All 3 toggle buttons visible (matching, LLM, publishing)
- Backend safety guard: Rejects `PATCH /crypto-news-publisher/llm` with `llmEnabled` changes in production (400 error)

## PROXY (dev vs prod differ — mind the gaps)

**Dev (`vite.config.ts`):**

- Backend proxy (`localhost:3030`): `/api`, `/crypto-news-publisher`, `/crypto-news-ads`, `/socket.io` (ws:true)
- **Ingestion-service proxy (`localhost:3032`):** `/ingestion-api/crypto-news/*`, `/ingestion-api/media/*`
- **REMOVED:** `/crypto-news/(messages|sources|backfill|media)` regex — now goes to ingestion-service via `/ingestion-api` prefix

**Prod (`nginx.conf`, 203 lines):**

- Backend locations (`backend:3030`): dashboard, telegram-kol, vip-calls, token, ingestion, call-tracking, telegram, settings, kols, crypto-news-publisher, crypto-news-ads, socket.io
- **Ingestion-service locations (`onchain-bot-ingestion:3031`):** `/ingestion-api/crypto-news/*`, `/ingestion-api/media/*`
- **REMOVED:** `/crypto-news/{messages,sources,media}` — now served by ingestion-service
- SPA fallback + gzip + security headers (`nosniff`, `DENY`, strict referrer) + 502 `@maintenance` JSON + `client_max_body_size 12m`

**Architecture note:** Crypto-news data flows: Telegram → ingestion-service DB → HTTP API → frontend (direct query, no backend middleman).

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
- Views mirror backend DTOs (`TokenSnapshotView` with RugCheck `locked/burnedPercent`, `primaryPair`, `completeness`; `PublishedCallView` repeats the local tier union — same mismatch as gap 7; `GateAllowView{allowed, reasons[]}`).
- Config forms (`AdsRotationConfigForm`, LLM config) edit string drafts re-seeded from server only when upstream values actually change (no mid-edit clobber).
- Kols footer: `rangeStart–rangeEnd de total` + page counter (Spanish UI); empty state `No hay KOLs registrados`.
- `token-classification` is a chipless-fetch entity: types + `ClassificationChip` only (classifications arrive inside score/canonical payloads, never fetched directly).
- `AdHtmlPreview` (224 lines): sanitizing mini-renderer mirroring backend `telegram-html-sanitizer.ts` — Telegram HTML allowlist, tokenized rebuild as React elements, no `dangerouslySetInnerHTML`.
- `SourceMultiSelect`: empty ids = global scope (`All sources (global)` label).
- `uuid.generateId()`: `crypto.randomUUID()` with Math.random fallback for non-secure HTTP contexts.

## TESTS (23 files, vitest)

Co-located `*.test.{ts,tsx}` + `__tests__/` dirs, heaviest in crypto-news features (ads-manager 1900+ lines, crypto-news-page). `src/test/setup.ts` only. jsdom + testing-library/react in deps.

## UNUSED DEPS (verified zero imports in `src/`)

`recharts`, `zustand`, `lucide-react`, `zod`, `msw` — README's table is correct (add `msw`, also zero). Emojis serve as icons; no charts; no client store; no schema validation; no mocks.

## CONVENTIONS

FSD downward-only (`app → pages → widgets → features → entities → shared`); per-slice `ui/api/model/index.ts`; `@/*` alias (tsconfig `baseUrl: ./src`); TanStack Query (`staleTime 5s`, `retry 1`, `refetchOnWindowFocus false`, per-hook `refetchInterval` polling); mutations invalidate on success; Tailwind only (+ per-BC `bc.*` color tokens in `tailwind.config.ts`: ingestion blue … publishing green); singleQuote + trailingComma prettier (`endOfLine auto`); `react-hooks/exhaustive-deps: warn`, unused-vars warn (`^_`).

- Replay (Ops) posts operator-pasted raw Telegram `text` to `POST token/intake/extraction/extract` — intentional admin path for raw text over HTTP (wire format mirrors backend `ExtractInput` DTO).
- Entity slice pattern: `api/<x>-queries.ts` (key factory `['entity', …]` as const + fetch fns with `?limit=` params) → `model/use-<x>.ts` (hooks) → `ui/` presentational → barrel `index.ts`.
- `TokenImage`: DexScreener CDN fallback (`/ds-data/tokens/{slug}/{address}.png`, evm→ethereum) → deterministic hash-colour placeholder with ticker initial (4 sizes xs–lg); gauges (`score`, `liquidity`, `holder-concentration`, `bonding-curve`) + `chain-icon` + `lightbox` live in shared/ui. Note two image paths: `format.tokenImageUrl` routes via backend proxy (`/token/image/…`, LRU + WebP), `TokenImage` falls back to DexScreener direct.

## DEPLOY

Multi-stage Dockerfile (node:22-bookworm build with `tsc -b && vite build` via root `build:frontend` → nginx:1.27-alpine static, `EXPOSE 80`, wget healthcheck). `.dockerignore` present. `CHANGELOG.md` at app root (conventional-changelog, v1.3.2 latest — matches `package.json`).

## COMMANDS

```bash
cd apps/frontend            # or root -w @alpha-meta-token-scanner/frontend
npm run dev                 # :5173 strict (root runs port-cleanup first)
npm run build               # tsc -b && vite build
npm run test | :watch       # vitest run | vitest
npm run lint                # eslint src --fix (react+hooks+prettier)
npm run format              # prettier --write "src/**/*.{ts,tsx}"
```

## GAPS (verified)

1–6. **Dead URLs above** — backfill, byToken, dashboard kpis, reprocess ×3, `/api/*` in prod, filters/backfill proxy holes. Biggest functional hole in the dashboard. 7. **ScoreTier mismatch** vs backend (`GOOD/POOR/FAILED` vs `DECENT/RISKY/AVOID`) — and `tierTone()` has no default branch, so real backend tiers hit `tones[undefined]` → unstyled badge (clsx drops it, no crash, but wrong). Same smell in `classificationTone`: `'blue' as never` hack (Badge supports blue; the return type just omits it) and no default. Align the unions AND add fallbacks. 8. **Frontend README §3 stale** (`/kols`, `/token/token-gating/*`, 4 links vs 6 routes, missing crypto-news/settings/ads/tracking groups). 9. **Fix-1 smell**: `TelegramMessageIngestedEvent.text` typed on the socket — confirm backend never emits it. 10. **From README, still true**: no error boundaries; no skeletons (plain `Cargando...`); `Chain`/`ScoreTier` duplicated between entities and `realtime/events.ts`. (README's "`hace 0s` hardcoded" is stale — timestamps come from payload since the LiveFeed rewrite.) 11. **`/kols` nginx location** with no frontend caller using bare `/kols/*` — legacy leftover (README-era routes); remove or document.

## NOTES

- Strict port: run from root (`predev` port-cleanup) or Vite exits.
- `@/` is frontend-only (tsconfig paths, not backend).
- `dist/` + `tsconfig.tsbuildinfo` committed in app dir (build artifacts present).
