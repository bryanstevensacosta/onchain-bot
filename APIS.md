# API Catalog — all apps (`apps/*`)

> Branch: `feat/mega-refactor-tramos`. Generated 2026-09-25 by read-only
> code scan. Every route below was grepped from a `@Controller` +
> method decorator in code — no invented endpoints. No global prefix is
> set in any service (`setGlobalPrefix` has zero hits); all paths are
> bare as listed. Prettier-checked.

## Base URLs per env (ports table)

| App                           | Dev (local)             | Staging                     | Prod                         |
| ----------------------------- | ----------------------- | --------------------------- | ---------------------------- |
| backend                       | `http://localhost:3030` | staging backend `:3030`     | `http://localhost:3030`      |
| ingestion-telegram            | `http://localhost:3031` | `:3033` → container `:3031` | `:3032` → container `:3031`  |
| frontend                      | `http://localhost:5173` | `:4173`                     | `:80` (nginx static + proxy) |
| kol-system (NEW T1)           | `http://localhost:3050` | `:3051` (spec triplet)      | `:3052` (spec triplet)       |
| feed-publisher (NEW T2)       | `http://localhost:3040` | `:3041`                     | `:3042`                      |
| market-data (NEW T3)          | `http://localhost:4000` | `:4001` (host)              | `:4002` (host)               |
| kol-system pg/redis (dev)     | `:5435` / `:6382`       | per-env                     | per-env                      |
| feed-publisher pg/redis (dev) | `:5436` / `:6383`       | server-shared               | server-shared                |

Frontend same-origin proxy prefixes (dev `vite.config.ts`, prod
`nginx.conf` / `nginx.staging.conf`): `/api`, `/crypto-news-publisher`,
`/crypto-news-scheduling`, `/threads-publisher`, `/threads/matching`,
`/crypto-news/matching`, `/crypto-news/sources`, `/crypto-news/filters`,
`/ops/backups` → backend `:3030`; `/ingestion-api/*` → rewrite
`^/ingestion-api` → `/api` on own ingestion (`:3031` dev, `:3033`
staging, `:3032` prod); `/kol-api/*` → rewrite `^/kol-api` → `/api` on
kol-system `:3050` (dev only — **no nginx `/kol-api/` block yet**);
`/feed-api/*` → strip prefix on feed-publisher `:3040` (dev only —
**no nginx `/feed-api/` block yet**); `/socket.io` → backend (ws).

## Auth summary

| App                | Mechanism                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| backend            | None (no guard found; open inside VPC)                                                                                                                                                                                                                                                                 |
| ingestion-telegram | Global `ApiKeyGuard`: `INGESTION_API_KEY` vs `x-api-key` header or `?apiKey=`. Unset = warn + allow-all. Public keyless: `GET /api/feed/*`, `/api/media/*`, `GET /api/kol-avatar/*`, `/api/health`, `/live`, `/ready`. Protected: `GET /api/ingestion/stream`, `/debug/*`, `/metrics`, all feed writes |
| kol-system         | `ApiKeyGuard` (`KOL_SYSTEM_API_KEY`, fail-open when empty; provided via `@Global` SharedModule)                                                                                                                                                                                                        |
| feed-publisher     | `ApiKeyGuard` (`FEED_PUBLISHER_API_KEY`, `x-api-key` header, fail-open when empty; `@Public()` bypass for health/metrics; provided via `@Global` SharedModule)                                                                                                                                         |
| market-data        | `ApiKeyGuard` (`MARKET_DATA_API_KEY`, `x-api-key` header, fail-open when empty; `@Public()` bypass for health; `shared/guards` is a compat re-export of `shared/infrastructure/guards`)                                                                                                                |
| frontend           | None (same-origin; env vars `VITE_API_BASE_URL`, `VITE_WS_URL`, `VITE_FEED_PUBLISHER_URL`, all default `''`)                                                                                                                                                                                           |

---

## 1. backend (`apps/backend/src`) — ~184 routes, 51 controllers

Base `http://localhost:3030`. No global prefix; health is `GET /api/health`.

### 1.1 System / dev

| Method | Path                  | Purpose / params / response                                  |
| ------ | --------------------- | ------------------------------------------------------------ |
| GET    | `/`                   | Root ping (`app.controller.ts`)                              |
| POST   | `/dev/seed`           | Dev seed trigger                                             |
| POST   | `/dev/inject-message` | Mock ingestion: inject raw Telegram text (admin/replay path) |
| GET    | `/dev/queue-status`   | Mock queue depth                                             |
| POST   | `/dev/clear-queue`    | Mock queue drain                                             |
| GET    | `/api/health`         | Liveness (always 200)                                        |

### 1.2 KOL (`telegram-kol/*`) — ⚠️ identity surface is 501-deprecated

| Method | Path                                             | Purpose / params / response                                                |
| ------ | ------------------------------------------------ | -------------------------------------------------------------------------- |
| GET    | `/telegram-kol/identity/kols`                    | List KOLs → 501 shim (moved to ingestion `GET /api/feed/sources?type=kol`) |
| GET    | `/telegram-kol/identity/kols/active/ids`         | Active channel IDs → 501 shim                                              |
| POST   | `/telegram-kol/identity/kols`                    | Register KOL → 501 shim (`{channelId, title?, handle?, type?}`)            |
| GET    | `/telegram-kol/identity/kols/:kolId`             | Single KOL → 501 shim                                                      |
| POST   | `/telegram-kol/identity/kols/:kolId/lifecycle`   | Pause/resume/blacklist → 501 shim                                          |
| POST   | `/telegram-kol/identity/kols/:kolId/backfill`    | History refill → **501, no feed equivalent** (frontend trigger deleted)    |
| GET    | `/telegram-kol/reputation/kols`                  | Reputation list                                                            |
| GET    | `/telegram-kol/reputation/kols/top`              | Top reputations                                                            |
| GET    | `/telegram-kol/reputation/kols/:kolId`           | Reputation by KOL                                                          |
| POST   | `/telegram-kol/reputation/kols/recompute/:kolId` | Rescore KOL (`?formula=` optional)                                         |
| GET    | `/telegram-kol/stats/kol-leaderboard`            | **v1-stub** (empty lot, screens use reputation)                            |
| GET    | `/telegram-kol/stats/top-calls`                  | **v1-stub**                                                                |
| GET    | `/telegram-kol/stats/roi-trends`                 | **v1-stub**                                                                |
| GET    | `/telegram-kol/stats/alpha-callers`              | **v1-stub**                                                                |

### 1.3 Token pipeline (`token/*`)

| Method | Path                                                 | Purpose / params / response                                                                              |
| ------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| POST   | `/token/intake/extraction/extract`                   | Extract candidates from raw text (`{text}` → candidates)                                                 |
| GET    | `/token/intake/extraction/results/recent`            | Recent extraction results (`?limit=`)                                                                    |
| GET    | `/token/intake/extraction/results/:kolId/:messageId` | Extraction by message                                                                                    |
| POST   | `/token/intake/parsing/parse`                        | Parse candidates → structured call                                                                       |
| GET    | `/token/intake/parsing/calls/recent`                 | Recent parsed calls                                                                                      |
| GET    | `/token/intake/parsing/calls/:kolId/:messageId`      | Parsed call by message                                                                                   |
| GET    | `/token/normalization/tokens/recent`                 | Recent canonical calls (`?limit=`)                                                                       |
| GET    | `/token/normalization/tokens/:chain/:address`        | Canonical call by token                                                                                  |
| POST   | `/chain/detection/detect`                            | Detect chain (`{address}` → chain)                                                                       |
| GET    | `/chain/detection/results/recent`                    | Recent detections                                                                                        |
| GET    | `/chain/detection/results/:address`                  | Detection by address                                                                                     |
| POST   | `/token/enrichment/enrich`                           | Enrich token (`{chain, address}` → snapshot; canonical since T3 todo 6, `enrichment.controller.ts:16`)   |
| GET    | `/token/enrichment/snapshots/recent`                 | Recent snapshots (`enrichment.controller.ts:28`)                                                         |
| GET    | `/token/enrichment/snapshots/:chain/:address`        | Snapshot by token (`enrichment.controller.ts:36`)                                                        |
| POST   | `/token/market-data/enrich`                          | **307 redirect** → `/token/enrichment/enrich` (one-version shim, `enrichment-redirect.controller.ts:14`) |
| GET    | `/token/market-data/snapshots/recent`                | **307 redirect** (shim `:20`)                                                                            |
| GET    | `/token/market-data/snapshots/:chain/:address`       | **307 redirect** (shim `:33`)                                                                            |
| GET    | `/token/image/:chain/:address`                       | Token icon (LRU + WebP, DexScreener fallback)                                                            |
| POST   | `/token/classification/classify`                     | Classify token (safe/scam/unknown)                                                                       |
| GET    | `/token/classification/tokens/recent`                | Recent classifications                                                                                   |
| GET    | `/token/classification/tokens/:chain/:address`       | Classification by token                                                                                  |
| POST   | `/token/scoring/score`                               | Score 0–100 (`{chain, address}` → score + `breakdown[]`)                                                 |
| GET    | `/token/scoring/tokens/top`                          | Top scores                                                                                               |
| GET    | `/token/scoring/tokens/recent`                       | Recent scores                                                                                            |
| GET    | `/token/scoring/tokens/:chain/:address`              | Score by token                                                                                           |
| POST   | `/token/vip-call-approval/apply`                     | Run 8 gates (→ approved/rejected)                                                                        |
| GET    | `/token/vip-call-approval/decisions/approved`        | Approved decisions                                                                                       |
| GET    | `/token/vip-call-approval/decisions/rejected`        | Rejected decisions                                                                                       |
| GET    | `/token/vip-call-approval/decisions/recent`          | Recent decisions                                                                                         |
| GET    | `/token/vip-call-approval/decisions/:chain/:address` | Decision by token                                                                                        |
| POST   | `/token/honeypot/analyze`                            | Honeypot analysis (`{chain, address}`)                                                                   |
| GET    | `/token/honeypot/analyses/recent`                    | Recent analyses                                                                                          |
| GET    | `/token/honeypot/analyses/:chain/:address`           | Analysis by token                                                                                        |
| POST   | `/token/call-tracking/calls/evaluate`                | Evaluate call outcome                                                                                    |
| POST   | `/token/call-tracking/jobs/enqueue`                  | Enqueue eval job                                                                                         |
| GET    | `/token/call-tracking/jobs/:id`                      | Job status                                                                                               |
| POST   | `/token/call-tracking/jobs/evaluate-due`             | Evaluate due jobs                                                                                        |
| POST   | `/token/call-tracking/scheduler/tick`                | Manual scheduler tick                                                                                    |
| GET    | `/call-tracking/tracked`                             | Tracked calls (`?limit=`, `?hasMilestones=`)                                                             |
| GET    | `/call-tracking/tracked/:chain/:address`             | Tracked call detail                                                                                      |
| POST   | `/call-tracking/gate-allow`                          | Repost gate check                                                                                        |
| GET    | `/achievements/thresholds`                           | Milestone thresholds                                                                                     |
| PUT    | `/achievements/thresholds`                           | Replace thresholds                                                                                       |
| POST   | `/achievements/thresholds`                           | Add threshold                                                                                            |
| DELETE | `/achievements/thresholds/:multiple`                 | Remove threshold                                                                                         |
| POST   | `/achievements/admin/tick`                           | Manual trophy tick                                                                                       |

### 1.4 Telegram publishing / VIP (`vip-calls`, `chain-dexter`)

| Method | Path                         | Purpose / params / response |
| ------ | ---------------------------- | --------------------------- |
| POST   | `/vip-calls/publish`         | Manual publish              |
| GET    | `/vip-calls/calls/published` | Published calls             |
| GET    | `/vip-calls/calls/failed`    | Failed calls                |
| GET    | `/vip-calls/calls/recent`    | Recent published            |
| POST   | `/chain-dexter/webhook`      | Dexter bot webhook          |
| POST   | `/chain-dexter/health`       | Dexter webhook health       |
| GET    | `/chain-dexter/token`        | Dexter token lookup         |

### 1.5 Ingestion proxy / crypto-news filters (Opción A, backend-owned)

| Method | Path                                      | Purpose / params / response                                                    |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/ingestion/config`                       | Ingestion config view                                                          |
| GET    | `/ingestion/health`                       | Ingestion health view                                                          |
| POST   | `/crypto-news/sources/:channelId/filters` | Create content filter (`{pattern, replacement?, flags?, priority?}`)           |
| GET    | `/crypto-news/sources/:channelId/filters` | Filters by channel                                                             |
| PUT    | `/crypto-news/filters/:id`                | Replace filter                                                                 |
| DELETE | `/crypto-news/filters/:id`                | Delete filter                                                                  |
| PATCH  | `/crypto-news/filters/:id/toggle`         | Enable/disable filter                                                          |
| GET    | `/crypto-news/matching/config`            | Matching flag + config (sole source id=1; also serves `/feed-matching/config`) |
| GET    | `/crypto-news/matching/health`            | Matching health (also `/feed-matching/health`)                                 |
| PATCH  | `/crypto-news/matching/config`            | Toggle matching (rejects `matchingEnabled` in LLM body with 400)               |
| GET    | `/crypto-news/dead-letter`                | Dead-letter queue                                                              |
| POST   | `/crypto-news/dead-letter/:id/retry`      | Retry dead letter                                                              |

Dual-serve (P41, T2 todo 13 Fase 1): `PUT|DELETE|PATCH /feed-filters/:id[toggle]`
(`feed-filters.controller.ts:41,76,93`) delegate to the SAME filter use-cases
as `PUT|DELETE|PATCH /crypto-news/filters/:id`. Per-channel create/list
(`POST|GET /crypto-news/sources/:channelId/filters`) stay on the old
controller only — no `feed-sources` in the backend.

### 1.6 Crypto-news publisher (`crypto-news-publisher/*` ≡ `feed-publisher/*`) — legacy until T2 cutover

Every controller below dual-serves both prefixes (array `@Controller`,
e.g. `['crypto-news-publisher/keywords', 'feed-publisher/keywords']`).
Keywords (`/crypto-news-publisher/keywords` ≡ `/feed-publisher/keywords`): `GET /`, `GET /:id`,
`POST /` (single + AND-groups), `POST /batch`, `PATCH /:id`,
`DELETE /:id`.
Phrases (`/crypto-news-publisher/phrases`, **read-only — no write
routes in controller**): `GET /` (list), `GET /search?q=`,
`GET /conflict-check`.
Blacklist (`/crypto-news-publisher/blacklist`): `GET /`, `GET /:id`,
`POST /`, `POST /batch`, `PATCH /:id`, `DELETE /:id`.
LLM (`/crypto-news-publisher/llm`): `GET /models`, `GET /templates`,
`GET /templates/:id`, `POST /templates`, `PATCH /templates/:id`,
`DELETE /templates/:id`, `POST /preview`, `GET /config`,
`PATCH /config` (rejects `llmEnabled` changes in production with 400).
Queue (`/crypto-news-publisher/queue`): `GET /` (rich list, cap 500),
`GET /counts`, `DELETE /:id` (cancel);
`GET /crypto-news-publisher/queue/:id/media` (media preview).

### 1.7 Crypto-news ads (`crypto-news-ads/*` ≡ `crypto-news-scheduling/*` ≡ `feed-scheduling/*`) — legacy until T2 cutover

Ads (`/crypto-news-ads/ads`): `GET /`, `POST /`, `PATCH /:id`,
`POST /:id/image`, `POST /:id/reuse-image`, `DELETE /:id/image`,
`POST /:id/video`, `DELETE /:id/video`,
`POST /:id/reuse-library-images`, `POST /:id/publish-now`,
`DELETE /:id`.
Media (`/crypto-news-ads`): `GET /media/:mediaId`,
`GET /media-library`, `GET /media-library/:libraryMediaId`.
Rotation (`/crypto-news-ads/rotation-config`): `GET /`, `PATCH /`.

### 1.8 Threads publisher (`threads-publisher/*` ≡ `feed-threads-publisher/*`, `threads/*`) — legacy mirror

Keywords (`/threads-publisher/keywords`): `GET /`, `GET /:id`,
`POST /`, `POST /batch`, `PATCH /:id`, `DELETE /:id`.
Phrases (`/threads-publisher/phrases`, **read-only**): `GET /`,
`GET /search?q=`, `GET /conflict-check`.
Blacklist (`/threads-publisher/blacklist`): `GET /`, `GET /:id`,
`POST /`, `POST /batch`, `PATCH /:id`, `DELETE /:id`.
LLM (`/threads-publisher/llm`, **no preview route**): `GET /models`,
`GET /templates`, `GET /templates/:id`, `POST /templates`,
`PATCH /templates/:id`, `DELETE /templates/:id`, `GET /config`,
`PATCH /config`.
Queue (`/threads-publisher/queue`): `GET /`, `GET /counts`,
`DELETE /:id`.
Matching (`/threads/matching`): `GET /config`, `GET /health`,
`PATCH /config`.

### 1.9 Settings / dashboard / ops

Signals/filters/thresholds (`/settings/signals|filters|thresholds`):
`GET /`, `POST /`, `PATCH /:id`, `DELETE /:id` (filters list supports
`?type=`).
Presets (`/settings/presets`): `GET /`, `GET /active`, `GET /:id`,
`POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/apply`.
Audit: `GET /settings/audit`.
Dashboard: `GET /dashboard/kpis` (module unwired — degrades to 0s).
Ops: `GET /ops/backups/status`, `GET /ops/backups/config`.

### Deprecated backend routes (do not re-encode)

- `*/identity/*` writes + backfill → **501** (identity lives in
  ingestion feed API; `kolIdentityGone`, single 501 code, never 410).
- `POST /crypto-news/sources*` → **501** (ingestion-telegram sole
  owner); old `/api/feed/*` paths → **404** (feed-unification).
- Backend MTProto forcing → **410 Gone** (rollback-only, no session).
- `matchingEnabled` inside `PATCH .../llm/config` → **400 + hint**
  (use `/crypto-news/matching/config`).

---

## 2. ingestion-telegram (`apps/ingestion-telegram/src`) — 20 routes, 8 controllers

Feed + registry dual-serve BOTH prefixes: `@Controller(['api/feed',
'api/crypto-news'])` (`feed.controller.ts:88`, `sources.controller.ts:66`).
Every path below exists under `/api/feed/*` AND `/api/crypto-news/*`.

### SSE / stream

| Method | Path                    | Purpose / params / response                                                                                                                                                                                                                                                                                    |
| ------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/ingestion/stream` | SSE fan-out (open stream, no gate; **protected when key set**). Events: `connection:established`, `message:telegram` (`{peerId, messageId, occurredAt, text? (feed only), media[], entities?, groupedId?, messageType: 'kol'\|'crypto-news'}`), `health:ping` every 30 s. Lossy: no replay, no `Last-Event-ID` |

### Feed reads (public GET)

| Method | Path                                    | Purpose / params / response                                                                                                            |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/feed/messages`                    | Recent RAW messages (`?limit=50`, `?type=kol\|crypto-news`; invalid type → 400; omitted = mixed legacy; ≡ `/api/crypto-news/messages`) |
| GET    | `/api/feed/messages/channel/:channelId` | History by channel (`?limit=50`; ≡ `/api/crypto-news/messages/channel/:channelId`)                                                     |
| GET    | `/api/feed/stats`                       | `{totalMessages, totalSources, activeSources}` (typed counts; ≡ `/api/crypto-news/stats`)                                              |

### Registry / sources (writes protected when key set)

| Method | Path                                  | Purpose / params / response                                                                                                                                    |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/feed/sources`                   | Register source (`{channelId, title?, handle?, type?}` → 201 + source view incl. `avatarUrl`; fetch-once avatar fire-and-forget; ≡ `/api/crypto-news/sources`) |
| POST   | `/api/feed/sources/batch`             | Batch register                                                                                                                                                 |
| GET    | `/api/feed/sources`                   | List sources (`?type=`; each row carries `avatarUrl: /api/kol-avatar/:channelId`)                                                                              |
| GET    | `/api/feed/sources/active/ids`        | Active channel IDs only                                                                                                                                        |
| PATCH  | `/api/feed/sources/:channelId`        | Update source                                                                                                                                                  |
| PATCH  | `/api/feed/sources/:channelId/toggle` | Flip `isActive`                                                                                                                                                |
| DELETE | `/api/feed/sources/:channelId`        | Delete source                                                                                                                                                  |

### Media / avatar

| Method | Path                                      | Purpose / params / response                                                                                   |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/media/:channelId/:messageId/:index` | Serve feed media file (public; 400 bad params, 404 missing; 1y cache + ETag; **no 206 ranges**)               |
| GET    | `/api/kol-avatar/:channelId`              | KOL avatar file-or-placeholder (public, always 200; permanent, janitor-excluded)                              |
| POST   | `/api/kol-avatar/:channelId/refresh`      | Explicit avatar refresh (**protected**; → 201 `{channelId, avatar: fetched\|cached\|placeholder, avatarUrl}`) |

### Health / metrics / debug

| Method | Path                                            | Purpose / params / response                       |
| ------ | ----------------------------------------------- | ------------------------------------------------- |
| GET    | `/api/health`                                   | Public (Docker HEALTHCHECK; ⚠️ stub — always 200) |
| GET    | `/api/health/ready`                             | Readiness (accepts SSE)                           |
| GET    | `/api/health/live`                              | Liveness                                          |
| GET    | `/api/health/channels`                          | ⚠️ Always `[]` (stub)                             |
| GET    | `/metrics`                                      | Prometheus (protected; ⚠️ counters mostly 0)      |
| GET    | `/debug/telegram/message/:channelId/:messageId` | Raw message inspection (protected, debug only)    |

---

## 3. kol-system (`apps/kol-system/src`) — NEW Tramo 1 surface, 30 routes, 7 controllers

Base `http://localhost:3050` (dev; `:3051` staging, `:3052` prod).
`KOL_SYSTEM_API_KEY` fail-open guard. No global prefix.

### Health

| Method | Path          | Purpose / params / response                                                             |
| ------ | ------------- | --------------------------------------------------------------------------------------- |
| GET    | `/api/health` | Composite `{status: 'ok', components: {ingestion, database, templates, publishing, …}}` |

### Templates (`api/templates`) — 12 endpoints + 501 stub

| Method | Path                                   | Purpose / params / response                                       |
| ------ | -------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/api/templates`                       | Template list (dashboard picker)                                  |
| POST   | `/api/templates`                       | Create template                                                   |
| GET    | `/api/templates/:id`                   | Template detail/config (incl. `scoringConfig`)                    |
| PATCH  | `/api/templates/:id`                   | Update template                                                   |
| DELETE | `/api/templates/:id`                   | Delete template                                                   |
| POST   | `/api/templates/:id/activate`          | Activate                                                          |
| POST   | `/api/templates/:id/deactivate`        | Deactivate                                                        |
| GET    | `/api/templates/:id/rankings`          | Ranked mentions (`TemplateCallRow`; `avatarUrl` on rows)          |
| GET    | `/api/templates/:id/pending-approvals` | Pending approvals (delegates to approval module)                  |
| PATCH  | `/api/templates/:id/sources`           | Persist `kolSourceIds[]` (feed-validated, fail-open)              |
| PATCH  | `/api/templates/:id/channel`           | Assign channel (`getChatMember` admin-verified, fail-closed)      |
| PATCH  | `/api/templates/:id/scoring`           | Merge + validate `scoring_config` (400 on invalid, stored intact) |
| ALL    | `/api/templates/:id/threads`           | **501 `THREADS_NOT_IMPLEMENTED`** (C1 stub, pinned)               |
| ALL    | `/api/templates/:id/threads/*`         | **501 `THREADS_NOT_IMPLEMENTED`**                                 |

### Telegram bots catalog

| Method | Path                     | Purpose / params / response                |
| ------ | ------------------------ | ------------------------------------------ |
| GET    | `/api/telegram-bots`     | List bots (always redacted `token: '***'`) |
| POST   | `/api/telegram-bots`     | Add bot (AES-256-GCM ciphertext only)      |
| GET    | `/api/telegram-bots/:id` | Bot detail (redacted)                      |
| PATCH  | `/api/telegram-bots/:id` | Update/rotate bot                          |
| DELETE | `/api/telegram-bots/:id` | Delete bot                                 |

### Approvals

| Method | Path                         | Purpose / params / response                         |
| ------ | ---------------------------- | --------------------------------------------------- |
| GET    | `/api/approvals/pending`     | Pending approvals (`?templateId?`, `?limit=1..500`) |
| POST   | `/api/approvals/request`     | Enqueue pending (idempotent)                        |
| POST   | `/api/approvals/evaluate`    | Auto-decide (active → source-visible → score-floor) |
| POST   | `/api/approvals/:id/approve` | Manual approve                                      |
| POST   | `/api/approvals/:id/reject`  | Manual reject (reason code)                         |

### Publishing

| Method | Path                      | Purpose / params / response                                                                     |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------- |
| POST   | `/api/publishing/publish` | Publish from template (ticker non-null enforced; missing bot/channel → dashboard-only, no post) |
| POST   | `/api/publishing/manual`  | Ops manual publish (explicit bot + channel)                                                     |
| GET    | `/api/publishing/recent`  | Recent jobs (`?limit=1..500`)                                                                   |
| GET    | `/api/publishing/failed`  | Failed jobs                                                                                     |

### Rankings

| Method | Path                | Purpose / params / response                                                                                                                                 |
| ------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/kol-rankings` | Caller ranking (`?window=30d\|7d\|1d&sort=perf_desc\|perf_asc\|calls_desc` → `[{caller, window, totalX, callsCount, strongCalls, display}]`; unknown → 400) |

Avatar: no HTTP routes in kol-system — `KolAvatarResolverService`
(`ingestion/application/services/kol-avatar-resolver.service.ts`) resolves
`avatarUrl` per caller from the ingestion source catalog and falls back to
the servable placeholder `/api/kol-avatar/<caller>` (ingestion-owned);
ranking/template rows carry the resolved `avatarUrl`.

---

## 4. feed-publisher (`apps/feed-publisher/src`) — NEW Tramo 2 surface, 73 routes, 16 controllers

Base `http://localhost:3040` (dev; `:3041` staging, `:3042` prod).
`FEED_PUBLISHER_API_KEY` (`x-api-key`), `@Public()` bypasses health;
fail-open when empty. No global prefix. Frontend reaches it via
`/feed-api` (`feedPublisherPath()` in `feed-publisher-base.ts`).

### Health / queue / matching

| Method | Path                              | Purpose / params / response                                                                                             |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`                     | `{status: 'ok'}` (`@Public`)                                                                                            |
| GET    | `/api/queue/stats`                | Queue depth + drain health (`FeedQueueStatsView`, 11 fields; **stats only** — rich list stays on backend until cutover) |
| GET    | `/api/queue`                      | Queue list (slim: no rawContent/media)                                                                                  |
| DELETE | `/api/queue/:id`                  | Cancel entry                                                                                                            |
| GET    | `/feed-publisher/matching/config` | Matching config (`{id, enabled, updatedAt}`)                                                                            |
| GET    | `/feed-publisher/matching/health` | Matching health (frozen 6-field view)                                                                                   |
| PATCH  | `/feed-publisher/matching/config` | Toggle matching                                                                                                         |

### Keywords / blacklist / filters (shape-compatible with backend legacy)

Keywords (`feed-publisher/keywords`): `GET /`, `GET /:id`, `POST /`,
`POST /batch`, `PATCH /:id`, `DELETE /:id` (409 intra/cross-table).
Blacklist (`feed-publisher/blacklist`): same 6 verbs.
Filters (`feed-publisher`): `POST /sources/:channelId/filters`,
`GET /sources/:channelId/filters`, `PUT /filters/:id`,
`DELETE /filters/:id`, `PATCH /filters/:id/toggle` (ReDoS-safe).

### LLM (`api/llm`) — 3 controllers

| Method | Path                     | Purpose / params / response                                                   |
| ------ | ------------------------ | ----------------------------------------------------------------------------- |
| GET    | `/api/llm/config`        | LLM config (id-less single-row)                                               |
| GET    | `/api/llm/flags`         | Pipeline flags (`PipelineFlagsView{flags, llmActive, mode}` truth-table)      |
| PATCH  | `/api/llm/config`        | Update LLM config                                                             |
| GET    | `/api/llm/templates`     | Prompt templates (GLOBAL catalog: `contentType` crypto-news\|threads\|global) |
| GET    | `/api/llm/templates/:id` | Template detail                                                               |
| POST   | `/api/llm/templates`     | Create template                                                               |
| PATCH  | `/api/llm/templates/:id` | Update template (409 in-use)                                                  |
| DELETE | `/api/llm/templates/:id` | Delete template                                                               |
| POST   | `/api/llm/preview`       | Transient render/generation (never persists)                                  |
| GET    | `/api/llm/models`        | Gateway `/v1/models` (5 s timeout)                                            |

### Scheduling (`api/scheduling/*`) — P36 rename: ads → scheduling

Ads (`/api/scheduling/ads`): `GET /`, `POST /`, `PATCH /:id`,
`POST /:id/image`, `DELETE /:id/image`, `POST /:id/video`,
`DELETE /:id/video`, `POST /:id/reuse-library-media`
(`{libraryMediaIds[]}`), `POST /:id/publish-now` (`{target?}`),
`DELETE /:id`.
Media (`/api/scheduling/media`): `GET /library`, `POST /library`,
`GET /library/:libraryMediaId`, `GET /:mediaId` (Range/206).
Rotation (`/api/scheduling/rotation-config`): `GET /`, `PATCH /`
(per-target `publishDelayMs` + `dailyCap` telegram\|threads, P38).

### Threads — v1 501 skeleton (C1, same code as T1 stub)

| Method | Path                 | Purpose                                                                       |
| ------ | -------------------- | ----------------------------------------------------------------------------- |
| ALL    | `/api/threads`       | **501 `THREADS_NOT_IMPLEMENTED`** (deferred to v2, `src/threads/CONTRACT.md`) |
| ALL    | `/api/threads/:id`   | **501**                                                                       |
| ALL    | `/api/threads/:id/*` | **501**                                                                       |

### Sessions + content-templates — NEW (todo 12, P33/P34 multi-tab)

Sessions (`/api/sessions`): `POST /`, `GET /`, `GET /:id`,
`PATCH /:id`, `PATCH /:id/activate`, `PATCH /:id/deactivate`,
`PATCH /:id/sources`, `DELETE /:id`.
Content-templates (`/api/content-templates`): `POST /`, `GET /`,
`GET /:id`, `PATCH /:id`, `PATCH /:id/activate`,
`PATCH /:id/deactivate`, `DELETE /:id`.
Template-bots (`/api/content-template-bots`): `POST /`, `GET /`,
`GET /:id`, `PATCH /:id/verify`, `DELETE /:id`.

---

## 5. market-data (`apps/market-data/src`) — NEW Tramo 3 gateway, 10 routes, 7 controllers

Base `http://localhost:4000` (`MARKET_DATA_PORT`; staging host `:4001`,
prod host `:4002` — `main.ts:8,28`). `MARKET_DATA_API_KEY` fail-open
guard, `@Public()` health. No global prefix. Six compat re-export files
under `gateway/api/http/` + `shared/guards/api-key.guard.ts` carry no
decorators (removed at cutover, todo 8).

### Gateway (`api/v1/*`) + legacy snapshot

| Method | Path                                | Purpose / params / response                                                                                             |
| ------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/chains`                    | Chain catalog (`chains.controller.ts:24`)                                                                               |
| GET    | `/api/v1/chains/detect`             | Detect chain (`?address=` required, 400 without; `:30`)                                                                 |
| GET    | `/api/v1/chains/:id`                | Chain by id (`:38`)                                                                                                     |
| GET    | `/api/v1/providers`                 | Provider catalog (`providers.controller.ts:19`)                                                                         |
| GET    | `/api/v1/providers/:name`           | Provider by name (`:25`)                                                                                                |
| GET    | `/api/v1/addresses/:chain/:address` | Address snapshot (`?kind=` optional; `addresses.controller.ts:30`)                                                      |
| POST   | `/api/v1/addresses/batch`           | Batch snapshot (`addresses-batch.controller.ts:63`)                                                                     |
| GET    | `/api/v1/tokens/:chain/:address`    | Token snapshot — thin alias pinned to `kind=token`, deprecated, removed at cutover (`tokens-snapshot.controller.ts:19`) |
| GET    | `/api/market-data/snapshot`         | Legacy snapshot (`?chain=&address=`; `market-data-snapshot.controller.ts:33`)                                           |

### Health

| Method | Path          | Purpose / params / response         |
| ------ | ------------- | ----------------------------------- |
| GET    | `/api/health` | `{status: 'ok'}` (`@Public`; `:14`) |

Frontend has NO market-data wiring yet (no `VITE_*` var, no `/api/v1/`
refs) — screens still read backend `/token/enrichment/*` §1.3.

---

## 6. frontend (`apps/frontend/src/shared/api`) — consumer map, no server

`http-client.ts` (fetch, `HttpError{status, body}`; GET/POST/PATCH/DELETE

- `httpPostForm`; no PUT/interceptors) + `endpoints.ts` (source of
  truth) + `settings-endpoints.ts` + `feed-publisher-base.ts`
  (`feedPublisherPath`, prefix `/feed-api`).

| Group (`ENDPOINTS.*`)                                                      | Backend routes consumed                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kols`                                                                     | `GET /ingestion-api/feed/sources?type=kol`, `POST /ingestion-api/feed/sources`, `PATCH …/toggle` (identity moved to feed API; backfill deleted)                                                                          |
| `publishing`                                                               | `/vip-calls/calls/published\|failed\|recent`, `POST /vip-calls/publish`                                                                                                                                                  |
| `extraction/parsing/normalization/classification/scoring/filters/honeypot` | `token/*` pipeline routes §1.3 verbatim (enrichment = `/token/enrichment/*` since T3 todo 6; backend 307-redirects legacy `/token/market-data/*`)                                                                        |
| `reputation`                                                               | `/telegram-kol/reputation/kols[/top\|/:id]`, `POST …/recompute/:id[?formula=]`                                                                                                                                           |
| `callTracking`                                                             | `POST /token/call-tracking/scheduler/tick\|jobs/evaluate-due\|jobs/enqueue`                                                                                                                                              |
| `feed.sources`                                                             | `GET /ingestion-api/feed/sources?type=crypto-news`, add/update/toggle/delete                                                                                                                                             |
| `trackedCalls`                                                             | `GET /call-tracking/tracked[/:chain/:address]`, `POST /call-tracking/gate-allow`                                                                                                                                         |
| `threads.*`                                                                | `/threads-publisher/*` + `/threads/matching/*` verbatim                                                                                                                                                                  |
| `ingestion`                                                                | `GET /ingestion/config`, `GET /ingestion/health`                                                                                                                                                                         |
| `kolSystem`                                                                | `/kol-api/templates[/:id\|/:id/rankings\|/:id/sources\|/:id/pending-approvals]`, `/kol-api/kol-rankings?window&sort`, `/ingestion-api/kol-avatar/:channelId` (pending-approvals defined, no fetcher yet)                 |
| `ops`                                                                      | `GET /ops/backups/status`                                                                                                                                                                                                |
| `feedPublisher.queue/matching/llm/scheduling/threads`                      | `/feed-api/api/queue/stats`, `/feed-api/feed-publisher/matching/*`, `/feed-api/api/llm/*` (models/config/flags/templates/preview), `/feed-api/api/scheduling/*` (ads/media/rotation), `/feed-api/api/threads` (501 stub) |
| `SETTINGS_ENDPOINTS`                                                       | `/settings/filters[?type=]`, `/settings/presets[/active\|/:id\|/:id/apply]`                                                                                                                                              |

Socket.IO (`VITE_WS_URL` ?? `localhost:3030`, ws→polling, 5 retries
1 s→30 s): `scoring.token.scored`, `vip-call.approval.*`,
`publishing.telegram.published|failed`, `normalization.call.normalized`;
rooms `chain:solana|evm`, `verdict:approved|rejected`, `published:all`,
`score:>=70`.

## Verification

- Route decorators grepped per app (backend 51 files / 184 method
  decorators, ingestion 8 / 20, kol-system 7 / 30, feed-publisher 16 /
  73, market-data 7 real + 6 compat re-exports / 10); counts in
  `.omo/evidence/apis-catalog.log`.
- `npx prettier --check APIS.md` clean.
