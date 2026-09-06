# apps/backend/ — NestJS Knowledge Base

> Verified 2026-09-04 against code. v1.3.2. Supersedes the "19 BCs / 48 entities / vip-calls-channel" claims.

Contents: OVERVIEW · COMMANDS · STRUCTURE · MODULES · INGESTION · KOL DOMAIN · CRYPTO-NEWS · PUBLISHING ·
PIPELINE · SCORING & GATES · HTTP ROUTES · SCHEDULERS · SHARED INFRA · PERSISTENCE ·
DATA PROVIDERS · TESTS · CONFIG & BOOTSTRAP · ENV INVENTORY · LOGGING · GAPS · CONVENTIONS ·
ANTI-PATTERNS · MIGRATIONS · OPS · NOTES

## OVERVIEW

NestJS 11 pipeline (DDD/Hexagonal) that consumes Telegram messages, runs them through an alpha-call pipeline (extraction → publishing) and a parallel opaque crypto-news path. Port from config (`app.port`, default **3000** — 3030 comes from env). CORS allows `http://localhost:5173` + `http://127.0.0.1:5173`.

**AppModule wires 22 active modules** (organized under 6 domain dirs) + infra. `DashboardModule` and `IdentityModule` imports are **commented out** — but `IdentityModule` still loads transitively via `KolIngestionModule`/`TelegramIngestionModule`/`SharedIngestionModule` (see Gaps).

## COMMANDS

```bash
# In apps/backend/ (or root with -w @alpha-meta-token-scanner/backend)
npm run start:dev          # db:migrate + nest start --watch
npm run start:debug        # db:migrate + nest start --debug --watch
npm run dev:mock           # USE_SSE_INGESTION=false USE_MOCK_INGESTION=true start:dev (no Telegram)
npm run dev:cli            # = dev:mock (alias)
npm run cli:inject         # ts-node scripts/cli/inject-message.ts (into mock queue)
npm run cli:record         # record live messages to file
npm run cli:replay         # replay recorded messages
# (interactive readline CLIs; BACKEND_URL default http://localhost:3030;
#  inject reads scripts/fixtures/*.json; record needs live MTProto/SSE ingestion)
npm run db:migrate         # node scripts/backfills/migrate.js (idempotent runner)
npm run db:migrate:dry-run | :status
npm run migration:run      # bash scripts/run-migrations.sh (TypeORM, staging/prod)
npm run migration:generate -- -n Name | :revert | :show
npm run db:backup          # bash ../../scripts/backup-db.sh
npm run telegram:gen-session  # legacy MTProto session generator (scripts/telegram-gen-session.ts)
npm test                   # jest --forceExit --testTimeout=30s (co-located *.spec.ts)
npm run test:e2e           # jest --config ./test/jest-e2e.json
npm run lint               # eslint "{src,test}/**/*.ts" --fix
```

## STRUCTURE

```
src/
├── main.ts                     # bootstrap() at :85 (NOT :38) — DEBUG scaffolding, 120 s startup timeout
├── main-debug.ts, main.backup.ts, test-new.ts   # ⚠️ stray files, not wired
├── app.module.ts               # 22 active modules + 2 commented (Dashboard, Identity)
├── app.controller.ts / app.service.ts / app.controller.spec.ts
├── token/ {intake/{extraction,parsing}, normalization, enrichment, classification,
│           scoring, vip-call-approval, honeypot, call-tracking, achievement,
│           identity (VOs only: ContractAddress, TokenLocator — no module)}
├── kol/ {identity, reputation, source, stats}   # kol/ingestion does NOT exist (it's telegram/ingestion)
├── chain/ {detection, registry, identity (VOs only: ChainId/Family/Hint — no module)}
├── telegram/ {ingestion, vip-calls, crypto-news-publisher, crypto-news-ads,
│              chain-dexter-bot, shared, extensions}
├── data-provider/ {13 adapters + core}
├── shared/ {kernel, common, filters, ws, cache, llm, deduplication, identicon}
├── dashboard/ / settings/ / health/ / dev/
scripts/ {backfills/ (19 date-prefixed + migrate.js/ts + README + templates),
          cli/{inject,record,replay}-message.ts, telegram-gen-session.ts, run-migrations.sh}
test/ {app.e2e-spec.ts, ingestion-side-by-side.e2e-spec.ts, jest-e2e.json}
docs/spydefi/arch/ (14 files: 01-principles … 13, INDEX)
```

Sub-BC `AGENTS.md` files consolidated here 2026-09-04 (7 files migrated + deleted; valid per-BC READMEs remain: `kol/identity/README.md`, per-provider READMEs).

## MODULES (app.module.ts — verified list)

Pipeline: Extraction, Parsing, Normalization, ChainDetection, ChainRegistry, Enrichment,
Classification, Scoring, **VipCallApproval** (NOT FiltersModule), Honeypot, CallTracking, Achievement.
Telegram: TelegramIngestion, TelegramPublishing (`vip-calls/vip-channel`), VipDecisions + VipAchievement
(event-side, no HTTP), ChainDexterBot, CryptoNewsPublisher, CryptoNewsAds.
KOL: Reputation, Source, Stats (**Identity commented, loads transitively**).
Infra/feature: Settings, Health, DataProvider, Ws, Llm (`shared/llm`), Deduplication, Dev.
Global infra: Config (`.env.dev` > `.env`), EventEmitter (`wildcard:false`, `.` delimiter, 32 listeners),
Schedule, Database (`forRootFromEnv`), Redis, Logger (pino — pino-roll files except staging stdout),
`DevBackfillHook`, `FilteredBootstrapLogger`, `ConfigConnectivityService`.

## INGESTION — 3 MODES (`telegram/ingestion/`)

`SharedIngestionModule` (`@Global`) selects `TelegramListenerPort` by flag
(`app.ingestion`: `useSse`/`useMock` default **false**, `serviceUrl` default `http://localhost:3031`):

| Mode                                | Flag                         | Adapter                                                                                                                              |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SSE (recommended)                   | `USE_SSE_INGESTION=true`     | `TelegramSseListenerAdapter` → `GET {serviceUrl}/api/ingestion/stream`, backoff 1 s→30 s cap, client-side channel filter             |
| Mock (CLI/tests)                    | `USE_MOCK_INGESTION=true`    | `TelegramMockAdapter` + `DevModule` (`POST /dev/inject-message`, `GET /dev/queue-status`, `POST /dev/clear-queue`) + `scripts/cli/*` |
| MTProto (deprecated, rollback-only) | both false (CURRENT DEFAULT) | `TelegramMtprotoListenerAdapter` — same session conflict risk as ingestion-service                                                   |

Adapter internals (`telegram-sse-listener.adapter.ts`, 459 lines): plain `fetch` + `ReadableStream`
manual frame parsing (`event: …\ndata: {json}\n\n`), channel filter client-side, `health:ping`
only logged; `payloadToRawMessage` maps media URLs into `filePath` with EMPTY
`fileId/accessHash/fileReference`; `groupedId` → `BigInt`. `backfill()` calls the service
endpoint (60 s timeout, skips non-`-100` peers) — dead end-to-end, see gap 27.
`resolveChannelMetadata`/`joinChannel` are NOT IMPLEMENTED placeholders (warn + dummy data) —
in SSE mode the backend can neither resolve titles nor auto-join (gap 24). Verbose
`[SSE-DEBUG]`/`[PAYLOAD-TRANSFORM-DEBUG]` logs on the hot path (gap 25).

Wiring (`SharedIngestionModule`, `@Global`): ALL THREE adapters always provided; `TelegramListenerPort`
selected by `useFactory` on flags (+ `TELEGRAM_LISTENER_PORT_TOKEN` alias). Quirk:
`CryptoNewsMediaDownloader` is pinned to the **MTProto** adapter regardless of mode.
`KolSeeder` (`telegram/ingestion/kol/seeders/`, `@deprecated` — use `POST telegram-kol/identity/kols`;
disable via `INGESTION_TELEGRAM_SEED_ENABLED=false`) + news seeder feed the backend DB; the
ingestion-service then pulls IDs over HTTP.

Backend `IngestionCoordinator` (`shared/application/ingestion-coordinator.service.ts`, `OnApplicationBootstrap`):
subscribes once → routes by `messageType` → `KolIngestionOrchestratorUseCase` (**lives in `kol/identity/application/handlers/`**, fix-1 direct calls to extraction/parsing) for `kol`, `StoreNewsMessageUseCase` for `crypto-news` (opaque persist, metadata-only event).

Provider endpoints consumed BY ingestion-service:

- `GET telegram-kol/identity/kols/active/ids` (`KolController.listActiveIds` → `ListActiveKolIdsUseCase` → `findActive()`)
- `GET crypto-news/sources/active/ids` (`CryptoNewsController`, `@Controller('crypto-news')`)

## KOL DOMAIN (`kol/`)

- `identity/`: `Kol` aggregate + 6 handlers (`RegisterKol`, `GetKol`, `ListKols`, `SetKolLifecycle`, `ListActiveKolIds` ← serves ingestion-service, `KolIngestionOrchestratorUseCase` with `execute` + per-message `onMessageReceived`). Lifecycle transitions on the aggregate (`activate/dormant/blacklist`); handle resolution seed > MTProto > null; `ResolvedKolMetadataRepository` JSON cache. Seed format: `kolId|handle|title` comma-separated (`INGESTION_TELEGRAM_SEED_CHANNELS`; `SEED_KOLS` JSON in ingestion-service). Same `[KOL-ORCH-DEBUG]` log-noise class as SSE adapter (gap 25).
- `reputation/`: pure `KolMetricsCalculator` → mention/quality/drawdown scores → `blendScore` with configurable `KolScoreFormula` weights (presets via `KolScorePresetRepository`) → whitelist ×1.2 / blacklist ×0.5 → clamp 0..1 → confidence from `totalMentions` (<5 LOW … 50+ VERY_HIGH). `RecomputeKolReputationUseCase` reads `findRecent(5000)`; scheduler every 15 min (config cron + disable flag); `KnownKolPort` (default static registry, DB-backed variant exists). Scoring consumes it via `KolReputationPort` multiplier. Outcome buckets (`strong/good/neutral/poor/failed`) all land in neutral until `call/lifecycle` ships.
- `source/`: attribution VO + `SourceAggregatorPort` (normalization hands raw seeds, gets deduped `Source[]`).
- `stats/`: stub (4 endpoints return `{note:'Stub'}`); frontend uses reputation `/kols/top`.

## CRYPTO-NEWS (Opción A: Filter on-Read Architecture)

**Architecture Overview (CRITICAL — Opción A chosen over Opción B)**:

- **Ingestion-service** stores RAW content (NO filters, NO transformations)
- **Backend** (staging/prod) polls ingestion-service HTTP API (every minute)
- **Backend** applies ContentFilterService + keyword matching on-read (NO DB replication)
- **Frontend** fetches RAW content directly from ingestion-service (display mode)
- **Publisher queue** receives FILTERED content (AFTER transformations + keywords matched)

**Production LLM Safety Guard (CRITICAL)**:

Backend enforces LLM generation in production via controller guard:

- `LlmConfigController.updateConfig()` REJECTS `PATCH /crypto-news-publisher/llm` requests with `llmEnabled` changes when `NODE_ENV=production`
- Returns 400 error: `{"error": "llmEnabled cannot be changed in production (always enabled for quality)", "hint": "Use matchingEnabled or publishingEnabled to control pipeline"}`
- Frontend hides LLM toggle button when `VITE_APP_ENV=production` (UI prevention layer)
- Three-layer defense: backend guard (API security) + frontend hide (UX clarity) + config seed (DB consistency)
- Rationale: In production, LLM-refined content is mandatory for quality; operators control pipeline via matching/publishing flags only

**Modules**:

1. `telegram/crypto-news-integration/` (NEW — Opción A orchestrator):
   - `CryptoNewsIngestionClient` — HTTP client for ingestion-service API
   - `FilteredCryptoNewsService` — fetch→filter→match orchestrator
   - `EnqueueMatchingCronScheduler` — poll every minute, enqueue matches

2. `telegram/ingestion/crypto-news/` (legacy — NO LONGER INGESTS):
   - `RegisterNewsSourceUseCase` — CRUD sources (backend DB, ingestion-service polls)
   - `ListActiveSourceIdsUseCase` — serves ingestion-service (GET /crypto-news/sources/active/ids)
   - `filters/` submodule — ContentFilterService rules (per-channel regex transforms)
   - Media ownership migrated to ingestion-service (backend reads via HTTP)

3. `telegram/crypto-news-publisher/`:
   - `EnqueueMatchingMessageUseCase` — enqueue matched messages (queue cap 36)
   - `ProcessNextQueuedArticleUseCase` — drain queue → LLM → Bot API
   - `PublisherCronScheduler` — every minute, advisory lock
   - `GetLlmModelsUseCase` — LLM gateway integration (`USE_MOCK_AI` flag)

4. `telegram/crypto-news-ads/` (parallel path):
   - Ad rotation + media library
   - `ads-cron` every minute

**Data Flow (Opción A)**:

```
Telegram → Ingestion-service (persist RAW) → HTTP API (:3031/api/crypto-news/messages)
                                                  ↓
Backend EnqueueMatchingCronScheduler (every min):
  1. Fetch RAW messages (CryptoNewsIngestionClient)
  2. Filter + match (FilteredCryptoNewsService):
     a. Load per-channel ContentFilterService rules
     b. Apply regex transforms to title + content (on-read)
     c. Evaluate keywords (simple + AND-groups)
     d. Check blacklist phrases (block if match)
  3. Enqueue matched messages (EnqueueMatchingMessageUseCase)
                                                  ↓
Backend PublisherCronScheduler (every min):
  1. Drain queue (ProcessNextQueuedArticleUseCase)
  2. LLM transformation (via gateway)
  3. Bot API publish (BotApiCryptoNewsPublisherAdapter)

Frontend:
  - Fetch RAW messages: GET ingestion:3032/api/crypto-news/messages?limit=50
  - Media: GET ingestion:3032/api/media/{channelId}/{messageId}/{index}
```

**Deprecated (NO LONGER USED)**:

- `CryptoNewsMessageIngestedHandler` — event-driven enqueue (listened to `crypto-news.message.ingested`)
- Backend NO LONGER ingests crypto-news via MTProto/SSE (ingestion-service owns this)
- Backend NO LONGER stores crypto-news in DB (`crypto_news_*` tables live ONLY in ingestion-service)

**ContentFilterService** (verified):

- Per-channel regex rules (priority-ordered)
- 100ms timeout per regex (ReDoS protection)
- Invalid patterns logged + skipped
- Applied on-read by FilteredCryptoNewsService (NO persist)

**Media tech** (migrated to ingestion-service):

- `MAX_MEDIA_BYTES` 10 MB (larger logged + discarded)
- Magic-byte sniffing (not Telegram-declared MIME), fallback `application/octet-stream` + `.bin`
- Backend reads via HTTP (`INGESTION_SERVICE_URL/api/media/*`)
- Serving re-sniffs via `media-serving.ts` (stored `.bin` MP4 served as `video/mp4`) with Range/206

**3-Flag Control System (CRITICAL DEPENDENCY)**:

The crypto-news pipeline uses **3 independent flags** to control enqueue, LLM generation, and publishing:

1. **`matchingEnabled`** (`MatchingConfig`, `crypto-news-integration` module)
   - Controls: `EnqueueMatchingCronScheduler` (polls ingestion-service every minute)
   - When `true`: fetches RAW messages → applies filters + keywords → enqueues matches
   - When `false`: no new messages enter the queue (queue drains if publishing active)

2. **`llmEnabled`** (`LlmConfig`, `crypto-news-publisher` module)
   - Controls: `ProcessNextQueuedArticleUseCase` content transformation mode
   - When `true` (AND `publishingEnabled=true`): generates LLM-refined content
   - When `false`: publishes raw content (no LLM transformation)
   - **DEPENDENT on `publishingEnabled`**: LLM generation ONLY occurs when BOTH flags are true

3. **`publishingEnabled`** (`LlmConfig`, `crypto-news-publisher` module)
   - Controls: `PublisherCronScheduler` (drains queue every minute)
   - When `true`: processes queue (with LLM if `llmEnabled=true`, raw otherwise)
   - When `false`: queue accumulates, NO publishing, NO LLM generation

**Truth Table (8 combinations)**:

| Matching | LLM | Publishing | Behavior                                                                |
| :------: | :-: | :--------: | ----------------------------------------------------------------------- |
|    ❌    | ❌  |     ❌     | **All paused** — No enqueue, no publish                                 |
|    ❌    | ❌  |     ✅     | **Drain queue raw** — No new enqueue, publishes existing queue raw      |
|    ❌    | ✅  |     ❌     | **All paused** — No enqueue, no publish (LLM inactive)                  |
|    ❌    | ✅  |     ✅     | **Drain queue with LLM** — No new enqueue, LLM + publish existing queue |
|    ✅    | ❌  |     ❌     | **Enqueue only** — Builds queue, no publish                             |
|    ✅    | ❌  |     ✅     | **Raw pipeline** — Enqueue + publish raw (no LLM)                       |
|    ✅    | ✅  |     ❌     | **Enqueue only** — Builds queue, no publish, LLM inactive               |
|    ✅    | ✅  |     ✅     | **Full pipeline** — Enqueue + LLM + publish                             |

**Critical Dependency Rule**:

```
LLM generation = llmEnabled AND publishingEnabled
```

**Why LLM depends on publishing**:

- If `publishingEnabled=false`, content won't be published — no point generating LLM (saves API costs)
- LLM generation occurs **at publish time**, not at enqueue time
- Queue accumulates raw content; transformation happens only when draining

**Use Cases**:

- **Pause publishing, keep enqueuing**: `matching=true`, `publishing=false` → queue builds
- **Publish raw only**: `llm=false`, `publishing=true` → no LLM transformation
- **Drain queue without new enqueue**: `matching=false`, `publishing=true` → processes existing
- **Emergency stop**: all flags `false` → pipeline frozen

**Implementation**:

- `MatchingConfig` entity lives in `crypto-news-integration/` (decoupled from publisher)
- `LlmConfig` entity holds both `llmEnabled` + `publishingEnabled` in `crypto-news-publisher/`
- Frontend: 3 independent toggle buttons (`MatchingToggleButton` component)
- Migration: `1788659125192-SplitLlmConfigFlags.ts` (splits old single `enabled` flag)

**NEVER**:

- LLM generation when `publishingEnabled=false` (even if `llmEnabled=true`)
- Assume matching depends on publisher config (they're decoupled by design)

**Queue TTL & Expiration (24h automatic cleanup)**:

To prevent unbounded queue growth when `publishingEnabled=false` for extended periods:

- **Scheduler**: `ExpireStaleQueueEntriesScheduler` runs every 30 minutes
- **TTL**: 24 hours (hardcoded, based on `queuedAt` timestamp)
- **Query**: `findPendingOlderThan(24h)` uses indexed query `WHERE status='PENDING' AND queued_at < cutoff`
- **Action**: Marks stale entries as `FAILED` with reason `"Expired: exceeded 24h in queue without publishing"`
- **Index**: `idx_publisher_queue_status_queued_at` (partial index `WHERE status='PENDING'`) optimizes the query
- **Migration**: `1860000000000-AddQueuedAtToPublisherQueue.ts`

**Why 24h TTL**:

- Crypto news loses relevance quickly (24h-old news is stale in fast-moving markets)
- Prevents publishing outdated content when publishing resumes
- Keeps queue size bounded during long pauses (e.g., maintenance, rate-limit issues)

**Deduplication Rules (Hybrid Status-Based Logic)**:

The deduplication system verifies `PublisherQueueEntry` status to decide whether to block re-enqueue:

**Always block**:

- `status=PENDING` → Already in queue waiting to be published
- `status=PUBLISHED` → Already published successfully

**Conditionally block** (`status=FAILED`):

- **Block if failure reason is content-related** (problem with the content itself):
  - `"non-Latin character"` (LLM output rejected by `rejectNonLatin` filter)
  - `"policy"` / `"Content violates policy"` (ToS violation)
  - `"blacklist"` (matched blacklist phrase)
  - `"honeypot"` / `"scam"` / `"rug"` (security-related block)
- **Allow if failure reason is transient/operational** (temporary issue, content is valid):
  - `"Expired: exceeded 24h in queue"` (TTL expiration — content can be re-tried)
  - `"Publisher not configured"` (missing bot token / channel config)
  - `"Rate limit exceeded"` (Telegram API rate limit)
  - `"LLM generation failed"` (temporary LLM service error)

**Implementation**:

- Constants: `BLOCKING_FAILURE_REASONS` array in `shared/deduplication/domain/constants/blocking-failure-reasons.ts`
- Helper: `isBlockingFailureReason(reason: string | null): boolean` (case-insensitive substring match)
- Location: Applied in `CryptoNewsMessageIngestedHandler` before calling `EnqueueMatchingMessageUseCase`

**Why hybrid logic**:

- Content-related failures should NEVER be re-enqueued (the content itself is problematic)
- Transient failures SHOULD allow re-enqueue (the content is valid, just failed due to temporary issues)
- Expired content can be re-matched if it appears again (user may want to publish fresh instance)

**Example flows**:

1. **Expired content re-appears**:
   - Entry A enqueued → 24h passes → TTL marks FAILED ("Expired")
   - Same content appears again → dedup checks status=FAILED + reason="Expired"
   - `isBlockingFailureReason("Expired")` = `false` → **Allow re-enqueue**
   - Entry B enqueued (fresh copy of same content)

2. **Blacklisted content re-appears**:
   - Entry A enqueued → matches blacklist → marked FAILED ("Blacklist match")
   - Same content appears again → dedup checks status=FAILED + reason="Blacklist match"
   - `isBlockingFailureReason("Blacklist match")` = `true` → **Block re-enqueue**
   - No entry created (content is permanently blocked)

3. **Content in PENDING status**:
   - Entry A enqueued → status=PENDING
   - Same content appears again → dedup checks status=PENDING
   - **Block re-enqueue** (already waiting in queue)
   - No duplicate entry created

**Tables affected**:

- `crypto_news_publisher_queue`: added `queued_at` column (timestamptz, DEFAULT NOW())
- Index: `idx_publisher_queue_status_queued_at` (partial, optimized for TTL queries)

## TELEGRAM PUBLISHING (Bot API, NOT MTProto)

- `telegram/vip-calls/`: `vip-channel` (publish flow: `tryReserve` RESERVED→`sendMessage`→`finalize`
  PUBLISHED|FAILED, `reconcile-stuck-reservations`, formatters, schedulers; `PublishedCall`
  aggregate lives in `telegram/shared/domain/`; per-publish `pub-<uuid>` correlation logs;
  `TickerResolverService` 9-level cascade DB→DexScreener→GeckoTerminal→CoinGecko→Moralis→Helius→name→`'ANON'`
  — the sanctioned exception to provider isolation) + `vip-decisions` (thin log-only
  `VipCallApproved/RejectedHandler`; the REAL publish trigger is `TokenApprovedPublishHandler`
  in vip-channel) + `vip-achievement` (`AchievementReachedHandler` → milestone posts) + `shared/`
  (`VipCallsBotApiPublisherAdapter`: raw HTTPS `sendMessage`/`sendPhoto`, **rate-limit 1 msg/min**,
  queue, messages >4096 chars chunked, Markdown with `disable_web_page_preview: false`;
  token `VIP_CALLS_BOT_TOKEN`, channel `VIP_CALLS_OUTPUT_CHANNEL`).
- Tables (verified names, already `vip-` prefixed): `vip_published_calls` (1) → (N) `vip_notified_achievements` on `call_id`; `PublishedCall` state machine RESERVED→PUBLISHED/FAILED (+`SKIPPED` in VO); `telegram_message_id` UNIQUE-partial; `correlation_id` per publish.
- Milestone flow: publish (step 6, `mcAtCall>0`) → `RegisterCallForAchievementsEvent` → `monitored_calls` → `LiveAchievementScheduler` → `athMultiple = mcNow/mcAtCall` → thresholds (2x, 5x…) → `CallAchievementReachedEvent` → milestone post (`🚀 MILESTONE 86x`) + `telegram_message_id` backfill. Formatter outputs publish format (`🟣 $CHAIN | $TICKER` + MC + address + Dexscreener link).
- `telegram/crypto-news-publisher/` + `crypto-news-ads/`: share `BotApiCryptoNewsPublisherAdapter` (`CRYPTO_NEWS_BOT_TOKEN`); publisher queue/throttle/slot tables; ads rotation + media library tables.
- `telegram/chain-dexter-bot/`: `CHAIN_DEXTER_BOT_TOKEN`, webhook (`POST webhook|health`) or polling ingest (`bot.config.ts`, `CHAIN_DEXTER_INGEST_MODE`, poll 1 s). 7 command handlers (`start/help`, `/x` scan, `/z` compact scan, `/c`+`/cc` charts, trade buttons, settings view) via `command-router` + `context-resolver` + `chat-settings` + `token-scan.pipeline`. `TokenScanService` returns a 19-field `TokenScanResult` (price/MC/FDV/liquidity/ATH/holders/top10-20) by composing `DetectChainUseCase` + `EnrichTokenUseCase` DIRECTLY (cross-BC use-case import — gap 7).
- Port: `telegram/shared/domain/ports/telegram-publisher.port.ts`. Ticker-null invariant enforced pre-publish.
- `telegram/extensions/Logger.ts`: single-file GramJS logger shim.

## PIPELINE — USE CASES & EVENTS (verified against `application/handlers` + `domain/events`)

| BC                | Command use case(s)          | Query use cases                       | Emits (verified `super()`/`EVENT_NAME`)                              |
| ----------------- | ---------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| intake/extraction | `ExtractFromMessageUseCase`  | GetRecentResults, GetExtractionResult | `extraction.candidates.extracted`                                    |
| intake/parsing    | `ParseFromCandidatesUseCase` | GetTokenCall, GetRecentCalls          | `parsing.call.parsed`                                                |
| normalization     | `NormalizeCallUseCase`       | GetCanonicalCall, ListCanonicalCalls  | `normalization.call.normalized`                                      |
| enrichment        | `EnrichTokenUseCase`         | GetSnapshot, ListSnapshots            | `enrichment.token.enriched` (+ `enrichment.token.failed`, not on WS) |
| classification    | `ClassifyTokenUseCase`       | List, Get                             | `classification.token.classified`                                    |

intake detail: primary CA = `addresses[0]` (multi-call messages collapse); confidence = unique-CA 0.4 (multi 0.2) + ticker 0.15 + `metrics.completeness×0.35` + name 0.1; `NO_CONTRACT_ADDRESS` on empty; heuristic regex adapter (`$TICKER`, labeled fields, K/M/B shorthand, chart-host allowlist).
enrichment detail: 7 adapters in factory order (DexScreener → GeckoTerminal → CoinGecko → CoinMarketCap → Birdeye → Mobula → Moralis), chain-catalog `MARKET_DATA` capability gate, `allSettled`, first-non-null-wins merge + pair dedup, 5-min `isFresh` snapshot cache, all-fail → `EnrichmentFailedEvent` (null view, still returned); `evm`→`ethereum` alias (v1); solana keeps original case.
classification detail: `TOKEN` default / `SCAM` iff `POSSIBLE_RUG` (liq<1000 + holders<10) / `UNKNOWN` iff no-pairs + no-holders + completeness<0.3; `POOL/ROUTER/NFT` never assigned in v1. 9 signal types (`NO_PAIRS` reserved, unused); weights CRITICAL 40 / HIGH 20 / MEDIUM 10 / LOW 3; confidence = base-by-category + completeness×0.2 − risk-penalty. Handler hardcodes `hasName/hasTicker=false` (bus data loss, cf. gap 29).
| scoring | `ScoreTokenUseCase` | GetTokenScore, ListTokenScores, GetTopScores | `scoring.token.scored` (payload `breakdown[]`) |
| vip-call-approval | `ApplyVipCallApprovalUseCase` + Reprocess/Verify/ReprocessBatch + List/Get/Diagnostics | — | `vip-call.approval.approved` / `.rejected` (NOT `filters.token.*` — gap 20) |
| honeypot | `AnalyzeTokenHoneypotUseCase` | List, Get | `honeypot.analysis.completed` |
| call-tracking | TrackPublishedCall, UpdateTrackedCalls, Enqueue/ProcessDue/Evaluate, CanRepublishToken | GetTrackedCall, List, GetEvaluationJob | consumes `publishing.telegram.published` |
| achievement | RegisterMonitoredCall, EvaluateActiveCalls, RecordNotifiedAchievement | — | `achievement.register.call`, `achievement.call.reached` |
| chain/detection | `DetectChainUseCase` | GetDetectionResult, ListDetectionResults | `chain-detection.chain.detected` |
| chain/registry | — (static catalog) | GetChain, ListChains | — |
| kol/source | — (VO lib: `Source{kolId, sourceType: TELEGRAM\|DISCORD\|OTHER, messageIds dedup}` + `SourceAggregatorPort` for normalization) | — | — |

Notable logic: `RegisterMonitoredCall` is idempotent by `callId`; `mcAtCall` resolves snapshot → input fallback → `VALIDATION` error. `CanRepublishToken` (behind `POST call-tracking/gate-allow`) returns `{allowed, reasons[]}` from settings-driven gates (`milestoneMinMultiple`, `milestoneMinHoursAgo`, `priceDropMaxPercent`; reasons `milestone_below_min|too_old`, `price_drop_exceeds_limit`, `no_tracked_call`, `tracking_disabled`) — it imports `SettingsService` cross-BC (gap 7).

fix-1 detail: `KolIngestionOrchestratorUseCase` (kol/identity) calls `ExtractFromMessageUseCase.execute({kolId, messageId, occurredAt, text})` then `ParseFromCandidatesUseCase` directly — no bus. `ExtractFromMessageUseCase` itself does save → `emitCandidatesExtracted()` → `publishAll(commit())`, returning the view.

chain/detection internals: `CHAIN_PROBERS` Symbol multi-binding (EVM via Alchemy `eth_getCode`, Solana via Helius `getAccountInfo`, 5 s `JsonRpcClient`); `Promise.allSettled` + result cache + id=`address.toLowerCase()`; handler skips `evm|solana` (safety net for future chains). Quirk: RPC scoring caps at 30 (EVM)/60 (Solana) but `computeConfidence` divides by 100 → confidence never exceeds 0.3/0.6.

Flow: intake direct calls (fix-1) → normalization → chain/detection + enrichment → classification → scoring → vip-call-approval → `TokenApprovedPublishHandler` (vip-channel, `@OnEvent(vip-call.approval.approved)`) → reserve→send→finalize → `publishing.telegram.published|failed`; honeypot + call-tracking on the side.

## SCORING & GATES (decision core, verified)

Score v1 (`ScoreTokenUseCase`, 501 lines): `base 50 + liquidity/holders/MC/volume/buzz bonuses − signal penalties (CRITICAL −15 / HIGH −8 / MEDIUM −4 / LOW −1) × reputation multiplier (0.85–1.15)`, floored by security flag (`SCAM→5`, `SUSPICIOUS→30`, `UNKNOWN→20`, `LEGITIMATE→100`), clamped 0–100 with per-factor `breakdown[]`. Tiers: STRONG 80 / DECENT 60 / NEUTRAL 40 / RISKY 20 / AVOID. Thresholds/bonuses come from `SettingsService` (cached) with hardcoded defaults; `reputationPort` averages channel scores (unknown channel = 0.5).

Gates (`ApplyVipCallApprovalUseCase`, fail-fast 0–7): `INVALID_ADDRESS` (defense in depth) → `SCORE_TOO_LOW` → `CLASSIFICATION_BLOCKED` → `BLACKLISTED` (in-memory hardcoded port) → `HONEYPOT_SUSPECTED` (cheap heuristic, not the honeypot BC) → `RISK_WEIGHT_EXCEEDED` → `INSUFFICIENT_DATA` → `CHAIN_UNSUPPORTED`. Config from `settings.getTokenGateConfig()` (cached 30 s), overridable per-call via `input.config`. Zero reasons = APPROVED.

Honeypot (`AnalyzeTokenHoneypotUseCase`): `HoneypotAnalyzerPort.analyze` → `{signals, buy/sell/transferTax, canBuy/canSell, ownerCanDrain/Renounced, isProxy, analysisSource}`; always emits `honeypot.analysis.completed`.

Normalization merge (`CanonicalTokenCall.mergeWith`, immutable): ticker wins by confidence, name/chart latest-non-null, metrics incoming-non-null-wins, sources deduped by channel, `firstSeenAt` min / `lastSeenAt` max, repo cap 5000 (largest in-memory store). Silent `null` on unsupported chain hint; HTTP is read-only (no POST).

WS fan-out (`WsGateway.EVENT_MAP`, 12 entries): `telegram.message.ingested`,
`extraction.candidates.extracted`, `parsing.call.parsed`, `normalization.call.normalized`,
`enrichment.token.enriched`, `classification.token.classified`, `scoring.token.scored`,
`vip-call.approval.approved|rejected` → `vip-call-approval.decision.applied`,
`publishing.telegram.published|failed`, `dashboard.kpis.updated`. Unmapped events are
silently dropped (no honeypot/filters/crypto-news on the socket). `hello` handshake reports
`missedSince` + `bufferedCount: 0` — no replay buffer, same lossy design as SSE (cf. ingestion-service gap 22).

## SCHEDULERS (two mechanisms)

`@Cron` decorators: vip `reconcile-stuck-reservations` EVERY_30_SECONDS; crypto-news-publisher
tick EVERY_MINUTE; ads tick EVERY_MINUTE; `MediaRetentionCleanupScheduler` EVERY_HOUR
(advisory lock, `cryptoNewsMediaRetentionHours` default 24 — the backend OWNS the media janitor
ingestion-service lacks). `SchedulerRegistry` dynamic registration (config-driven, concurrency-guarded):
`KolReputationScheduler` (cron from config, disable flag, iterates all KOLs),
`TrackingCronScheduler` (skip-if-running), `BackgroundEvaluationScheduler`
(`ANALYTICS_SCHEDULER_CRON` default `*/5 * * * *`, batch 50; manual `POST scheduler/tick`),
`LiveAchievementScheduler` (`token/achievement`, `app.milestone.schedulerCron`; manual `POST achievements/admin/tick`).

## HTTP ROUTES — 35 CONTROLLERS (verified `@Controller` prefixes)

Pipeline: `token/intake/extraction`, `token/intake/parsing`, `token/normalization`,
`token/market-data` (+ `token/image`), `token/classification`, `token/scoring`,
`token/vip-call-approval`, `token/honeypot`, `token/call-tracking` + `call-tracking`
(two prefixes: `call-tracking.controller` and `token/call-tracking`), `achievements`,
`chain/detection`. Telegram: `telegram-kol/identity`, `telegram-kol/reputation`,
`telegram-kol/stats`, `crypto-news`, `vip-calls`, `crypto-news-publisher/{queue,keywords,phrases,llm,blacklist}`,
`crypto-news-ads/{ads,rotation-config}`, `chain-dexter` (⚠️ TWICE: `webhook.controller` +
`chain-dexter.controller` — route-collision risk), `ingestion` (×2: config + health).
Feature: `settings/*` (full CRUD: `GET /` + `POST /` + `PATCH :id` + `DELETE :id` on
`signals` (filter `?appliesTo=token|kol`), `filters`, `thresholds` (filter `?scope=`);
`presets` adds `GET active`, `GET :id` (UUID), `POST :id/apply`; `audit` is read-only `GET /`),
`dashboard` (`GET kpis`), `achievements` (`GET|POST thresholds`, `POST admin/tick` manual
`LiveAchievementScheduler` trigger), `dev` (mock only), `api/health`.

Key routes: `GET telegram-kol/identity/kols/active/ids`, `GET crypto-news/sources/active/ids`,
`POST crypto-news/sources`, `POST telegram-kol/identity/kols/:kolId/backfill?limit=1..100`,
`GET crypto-news/backfill/:channelId`, `GET crypto-news/media/:mediaId`,
`POST vip-calls/publish`, `POST token/call-tracking/scheduler/tick`,
`GET call-tracking/tracked/:chain/:address` (README's `vip-calls/calls/:chain/:address` is
misattributed — the per-token lookup lives here), `GET telegram-kol/reputation/kols/top`.

`ads.controller.ts` holds TWO controllers (`crypto-news-ads/ads` + `crypto-news-ads` media).
`POST dev/seed?count=&delay=` on `AppController` fires synthetic pipeline events
(`scripts/seed-pipeline-events.ts`, 12×4 events) — ungated dev helper, see gap 14.

Stubs (return `{note:'Stub …'}`): all four `telegram-kol/stats/*` endpoints — frontend uses
`telegram-kol/reputation/kols/top` instead (recompute via `POST kols/recompute/:kolId`).

⚠️ README §4 tables are stale on prefixes (`/kols`, `/market-data`, `/intake/...` without
`token/` scope, missing settings/ads/publisher/image/achievements groups entirely).
Trust this section over README §4.

## SHARED INFRA (`src/shared/` + feature modules)

- `ws/gateway/ws.gateway.ts:32` — `@WebSocketGateway`, `@SubscribeMessage('join'|'leave')`,
  fan-out via `server.emit(wsEvent, payload)` (:116). Frontend subscribes for pipeline events.
- `settings/` — service-based BC (deviation: `SettingsService`, `SettingsPresetsService`, `AuditService` — NO use-case pattern), 5 controllers + co-located
  `settings.e2e-spec.ts` (runs under unit regex). `SettingsService` is imported cross-BC by call-tracking (gap 7).
- `dashboard/` — module commented out in AppModule BUT dir + `dashboard.module.ts` exist;
  `GET dashboard/kpis` only live when module wired (currently NOT in prod graph).
  `GetDashboardKpisUseCase` is a real implementation (reads Kol + CanonicalTokenCall +
  VipCallApprovalDecision + PublishedCall repos behind a cache port) — dead code by wiring, not by stub.
- `health/` — static `GET /api/health` (gap 9).
- `cache/` (`RedisModule` + `TokenImageCache` LRU/Redis adapters), `identicon/` (SVG from chain+address hash via `sharp`), `common/http/media-serving.ts` (`detectMediaMimeType` magic-byte re-sniff + `serveMediaFile` with Range/206 — serves crypto-news media), `llm/` (`LlmModule`: `LlmPort` + real/mock adapters — consumed by
  crypto-news-publisher keyword/LLM config), `deduplication/` (`DeduplicationService`:
  Fingerprint VO, ContentNormalizer/Hash, UrlNormalizer, DedupScorer + semantic-arbiter,
  TypeORM/in-memory stores — consumed by `crypto-news-message-ingested.handler`; unlike
  ingestion-service's unused one, this one is wired), `identicon/` (`sharp`), `filters/`
  (`DomainErrorFilter`), `kernel/` (AggregateRoot/Entity/ValueObject/DomainEvent/DomainError).
- Root providers: `DevBackfillHook`, `FilteredBootstrapLogger`, `ConfigConnectivityService`.
- Env files: `.env`, `.env.dev` (+ `.dev.backup-20260901-052702`), `.env.staging`,
  `.env.{staging,production}.template` — NO `.env.example` at backend root.
- `jest.setup.ts`: loads `.env`, forces `DATABASE_ENABLED=true` (tests always hit Postgres).

## PERSISTENCE — 41 ENTITIES (NOT 48)

`PERSISTED_ENTITIES` in `src/shared/common/persistence/entities.ts` (`EXPECTED_ENTITY_COUNT = 41`):
Kol, CanonicalTokenCall, KolReputation, TokenScore, TokenClassification, CallPerformance,
CallEvaluationJob, TrackedPublishedCall, VipCallApprovalDecision, TokenSnapshot, ExtractionResult,
TokenCall, HoneypotAnalysis, ChainDetectionResult, Signal, ScoringThreshold, Settings{Filter,AuditLog,Preset},
AchievementThreshold, MonitoredCall, PublishedCall, VipAchievement, CryptoNews{Source,Message,MessageMedia},
ChannelContentFilterConfig, BlacklistPhrase, Keyword, LlmConfig, PromptTemplate,
Publisher{Queue,ThrottleState,SlotState}, Ad{,Media,RotationConfig,RotationState}, AdsThrottleState, AdMediaLibrary, DedupRecord.

- `scripts/backfills/`: **19** date-prefixed idempotent backfills (`2026-06-26-*` … `2026-08-14-*`) + `migrate.js/ts` + README + `_template.*` (the "date-prefixed" claim is CORRECT).
- TypeORM migrations: 12 files in `src/shared/common/persistence/migrations/` (`{ts}-*.ts`); DataSource `…/persistence/data-source.ts`.
- `DATABASE_ENABLED=false` → in-memory repos; dev/test `synchronize:true`, staging/prod migrations (migration runbook from the old doc is still accurate — kept below).

## DATA PROVIDERS — 13 CONFIRMED

`alchemy, birdeye, coingecko, coinmarketcap, dexscreener, fluxrpc, geckoterminal, helius, mobula, moralis, pumpdev, rugcheck, solana-rpc` + `core/` (`DataProviderPort`: 28 lines — `name`, `logger`, optional `onModuleInit()`). Categories: Market Data (dexscreener, geckoterminal, birdeye, mobula, moralis, coingecko, coinmarketcap) · RPC (alchemy EVM, helius Solana, fluxrpc, solana-rpc) · Security (rugcheck) · Trading (pumpdev). Conventions (see `data-provider/AGENTS.md`, current): per-provider `{x}.config/module/service/types/index/README`; `forRoot(testConfig)` + `forRootAsync()` env-driven; **raw axios, no shared HTTP wrapper**; **silent `null` on 404/429/timeout** (consumers cascade) **but log the failure**; no cache/rate-limit at this layer (consumer-side, 30–60 s TTL recommended). Rate limits live in per-provider READMEs (e.g. DexScreener 60 req/min, Birdeye 1 req/s, Helius 1M CU/month); shapes in `{provider}.types.ts`. `DataProviderModule` is `@Global`. Deps also include `openai`, `@huggingface/@xenova transformers` (LLM), `sharp`, `bs58`, `socket.io`, `lru-cache`.

⚠️ `data-provider/README.md` says "11 providers" (13 exist) and points adapters at `chain/explorer/` (deleted). Same stale-doc class as gap 15. (`data-provider.module.ts` verified: imports+exports all 13.)

## TESTS

- Unit: `testRegex .*\.spec\.ts$`, `jest.setup.ts`, `--forceExit`, 30 s timeout. **Same `telegram/*` moduleNameMapper landmine as ingestion-service** (`^telegram/(.*)$` → `src/telegram/$1`, only `events`/`sessions` pinned) + dead `^discovery/` mapping (no `src/discovery/`).
- E2E (`test/`): `app.e2e-spec.ts` + `ingestion-side-by-side.e2e-spec.ts` (prod-MTProto vs staging-SSE parity ≥99.9%; ⚠️ header references `INGESTION_MODE=local/remote` env that doesn't exist — real flags are `USE_SSE_INGESTION`).
- `src/settings/settings.e2e-spec.ts` co-located INSIDE src (runs under unit `*.spec.ts` regex — not via jest-e2e).

## CONFIG & BOOTSTRAP (main.ts — instrumented)

- Manual dotenv (`.env.dev` override → `.env` fill) + `validateAppConfig` (fatal exit on `ConfigValidationError`) + numbered `[DEBUG] console.log` tracing + **120 s startup timeout** (`DATABASE_SYNCHRONIZE=true` hang guard) + `app.listen` 5 s hang warning.
- Port `appCfg?.port ?? 3000`; CORS 5173 ×2; global `ValidationPipe{whitelist, forbidNonWhitelisted, transform+implicitConversion}`; `DomainErrorFilter`; Socket.IO `IoAdapter`; `process.noDeprecation = true`.
- `appConfig = registerAs('app', …)` at `shared/common/config/app.config.ts:338` (NOT :178).

## ENV INVENTORY (`app.config.ts`, 591 lines; defaults)

Providers (all `''` default): `ALCHEMY/BIRDEYE/MOBULA/MORALIS/COINMARKETCAP_API_KEY`,
`FLUXRPC_{API_KEY,RPC,WS}`, `HELIUS_API_KEY` + mainnet/devnet RPC/parse/WS sets,
`PUMPDEV_{API_KEY,WALLET_PUBLIC,WALLET_PRIVATE}`, `TELEGRAM_BOT_TOKEN` (deprecated).
Bots: `VIP_CALLS_{BOT_TOKEN,OUTPUT_CHANNEL}`, `CRYPTO_NEWS_{BOT_TOKEN,OUTPUT_CHANNEL}`,
`CHAIN_DEXTER_{BOT_TOKEN,WEBHOOK_SECRET,WEBHOOK_URL,INGEST_MODE=webhook,POLLING_INTERVAL_MS=1000}`.
Ingestion: `USE_SSE_INGESTION`/`USE_MOCK_INGESTION` (false), `INGESTION_SERVICE_URL`
(`http://localhost:3031`); seeds `INGESTION_TELEGRAM_{SEED_ENABLED=true,SEED_KOLS|SEED_CHANNELS(legacy fallback),NEWS_SEED_ENABLED=true,SEED_NEWS,METADATA_CACHE_FILE,BACKFILL_ENABLED=true}`;
MTProto `INGESTION_TELEGRAM_MTPROTO_{ENABLED=true,API_ID=0,API_HASH,SESSION,LOG_LEVEL=error,STARTUP_DELAY_MS=60000,USE_WSS=false}`.
Pipeline: `PUBLISHING_{TELEGRAM_USE_REAL_MTPROTO=false,OUTPUT_CHANNEL,RECONCILIATION_ENABLED=true}`;
`ANALYTICS_{EVALUATION_HORIZONS_HOURS=24,168,720,SCHEDULER_CRON=*/5 * * * *,ENABLED=true,BATCH_SIZE=50}`;
`MILESTONE_{ACTIVE_WINDOW_HOURS=72,SCHEDULER_CRON=*/5 * * * *,ENABLED=true,BATCH_SIZE=30}`;
`KOL_REPUTATION_SCHEDULER_{CRON=*/15 * * * *,ENABLED=true}`.
Infra: `PORT=3000`, `DATABASE_{ENABLED=false,POSTGRES_*,SYNCHRONIZE=true,LOGGING=false}`,
`REDIS_{ENABLED=true,HOST=localhost,PORT=6379}`, `UPLOADS_ROOT=<cwd>/uploads`,
`CRYPTO_NEWS_MEDIA_RETENTION_HOURS=72` (drives backend read-window AND cleanup cron),
`DEDUP_SEMANTIC_ARBITER_THRESHOLD=0.7` (0 disables), `LLM_GATEWAY_{BASE_URL=localhost:4845,API_KEY,MODEL=opencode-zen/deepseek-v4-flash}`,
`LOG_{LEVEL,DIR=.,FILE=backend.log,ROTATION_SIZE=10m,ROTATION_LIMIT=5}`.

⚠️ `.env.production.template` sets `USE_SSE_INGESTION=false` (prod on legacy MTProto until migration)
and documents `INGESTION_REMOTE_URL=http://ingestion-service:3031` — **a var the code never reads**
(real: `INGESTION_SERVICE_URL`, gap 21). Migration banner + `validate-session-migration.sh` referenced
in-template; MTProto creds must live ONLY in ingestion-service (AUTH_KEY_DUPLICATED otherwise).

## LOGGING

pino-roll daily files (`logging.dir/fileName`, `limit count:1`) in dev/prod; plain stdout in staging.
`autoLogging.ignore`: `/api/health` + `/crypto-news/*`, `/crypto-news-publisher/*`, `/crypto-news-ads/*`.

## GAPS (verified — fix, don't re-encode)

1. **IdentityModule commented in AppModule but imported by Kol/TelegramIngestion/SharedIngestion modules** — loads transitively; DI graph lies. Uncomment or cut the submodule imports.
2. **MTProto adapter is still the DEFAULT** (`useSse` defaults false) while labeled "deprecated" — SSE migration incomplete; prod/staging run SSE only via env.
3. **(Consolidated 2026-09-04)** `src/telegram/AGENTS.md` deleted after migration; its stale paths (`vip-calls-channel/`, MTProto-as-current) died with it. Per-BC READMEs still carry the same rot (gap 22).
4. **Counts drift**: backend README says "16 BCs" (actually 22 wired), "306 tests", "46 KOLs seed", publishing "via MTProto" (it's Bot API) — README needs the same pass.
5. **Stray files**: `src/main-debug.ts`, `main.backup.ts`, `test-new.ts` — delete or document.
6. **Side-by-side spec cites `INGESTION_MODE`** — nonexistent; real flags `USE_SSE_INGESTION`/`USE_MOCK_INGESTION`.
7. **`IdentityModule`/cross-BC imports in 7+ places** (reputation, kol-ingestion, shared-ingestion, telegram-ingestion, dashboard import IdentityModule; chain-dexter imports chain/detection + token/enrichment use cases; call-tracking imports `SettingsService`) — the no-BC-import rule is dead letter. Either legitimize shared-kernel imports or cut them.
8. **Two controllers share `@Controller('chain-dexter')`** (`webhook.controller`: `POST webhook|health`; `chain-dexter.controller`: `GET token`) — paths don't collide today, but split ownership of one prefix confuses routing audits. Merge or re-prefix.
9. **`vip-decisions/` and `vip-achievement/` have no controllers** (module + event-bus handlers only) — event-side sub-BCs; decisions handlers are log-only, achievements posts milestones. Don't document HTTP routes for them; wire via events.
10. **README §4 route tables use wrong prefixes** (see HTTP ROUTES) — anyone wiring the frontend or ingestion-service from README will 404. Fix README or delete §4 and link here.
11. **`DevModule` wired unconditionally** (docstring says "only when USE_MOCK_INGESTION=true") — `/dev/inject-message|queue-status|clear-queue` live in prod with no auth. Worse: `POST dev/seed` sits on the root `AppController` (outside any dev module), firing synthetic pipeline events into the real event bus. Gate both or delete.
12. **(Consolidated 2026-09-04)** sub-BC `AGENTS.md` files (`token/`, `telegram/`, `vip-calls/`, `crypto-news/`, `shared/`, `kol/`, `data-provider/`) deleted after migrating verified content here. Remaining staleness lives in `shared/README.md` (`ca/*` paths, "19 BCs", `:178`) and per-BC READMEs (gap 22).
13. **Ticker-null nuance**: publish flow rejects null ticker, but `TrackedPublishedCall.ticker` is `varchar NULL` by design (tracking tolerates unresolved tickers) — don't "fix" the column; enforce at the publisher boundary only.
14. **CryptoNewsController is 702 lines** (imports `fs`, `Req/Res`, `InjectRepository` — TypeORM leaking into api layer).
15. **Health is static** (`status:'ok'` always) — same stub problem as ingestion-service gap 2, backend side.
16. **Ghost event `filters.token.approved|rejected`**: named in `token/AGENTS.md`, `telegram/AGENTS.md`, `vip-calls/AGENTS.md`, vip-call-approval README and one spec — but NO event file defines it and NO use case emits it. The real wire events are `vip-call.approval.approved|rejected`. The ghost survives because `scripts/seed-pipeline-events.ts` EMITS it (step 4) — seeded approvals vanish into the void since `TokenApprovedPublishHandler` listens to the real name. Purge the ghost name or the next reader will subscribe to silence.
17. **Dead var `INGESTION_REMOTE_URL`** in `.env.production.template` (code reads `INGESTION_SERVICE_URL`) — same class of bug as ingestion-service gap 12. Fix the template.
18. **Stale BC READMEs**: vip-call-approval README cites `apply-filters.use-case.ts` + `token-filtered/token-rejected.event.ts` (none exist; real: `apply-vip-call-approval.*`, `vip-call-{approved,rejected}.event.ts`); `token/AGENTS.md` cites `token-gating` + `ApplyFiltersUseCase` (renamed long ago); chain/detection + extraction READMEs cite `src/discovery/` + `/ca/*` routes (pre-rename). Per-BC READMEs need the same verification pass as gap 15.
19. **SSE mode can't resolve or join channels**: backend `resolveChannelMetadata` returns `Channel {id}` placeholders and `joinChannel` always fails — auto-join/seeder `needsManualJoin` paths are dead in the recommended mode. New channels need manual join + `POST kols`.
20. **Backend SSE hot path is as noisy as ingestion-service gap 10**: `[SSE-DEBUG]` ×3 per message (log level, not debug) plus `[PAYLOAD-TRANSFORM-DEBUG]` with full text. Demote to `debug`.
21. **`data-provider/README.md` stale**: "11 providers" (13 exist), adapter map points at deleted `chain/explorer/`, references `.omo/plans/data-provider-refactor.md` (agent state, not source).
22. **Backfill dead end-to-end in SSE mode**: backend `backfill()` → ingestion-service `/api/ingestion/backfill/*` → always `backfill:error` (ingestion-service gap 1). Both `POST kols/:kolId/backfill` and `GET crypto-news/backfill/:channelId` fail in the recommended mode — only MTProto-legacy backfills.
23. **`telegram:gen-session` script is legacy** — sessions now belong to ingestion-service (`INGESTION_TELEGRAM_MTPROTO_*`); backend MTProto mode would still `AUTH_KEY_DUPLICATED` against it.
24. **Event-driven scoring runs degraded**: `TokenClassifiedHandler` nulls market metrics, forces counts=1 and reputation 0.5 before calling `ScoreTokenUseCase` — bus-path scores differ systematically from admin `POST score` results. Either enrich the event or document the skew.
25. **`.env.staging` predates the SSE migration**: 67 keys but NO `USE_SSE_INGESTION`, `INGESTION_SERVICE_URL`, `INGESTION_TELEGRAM_SEED_KOLS/NEWS`, `CHAIN_DEXTER_WEBHOOK_*`, `CRYPTO_NEWS_MEDIA_RETENTION_HOURS`, `DEDUP_*`, `LOG_*` — and it still carries legacy `INGESTION_TELEGRAM_SEED_CHANNELS`. Staging boots MTProto-legacy by default (cf. gap 2).
26. **Seed script emits invalid classifications**: `seed-pipeline-events.ts` uses `LEGITIMATE/RISKY/SAFE` — outside the `Classification` VO (`TOKEN/POOL/ROUTER/NFT/SCAM/UNKNOWN`). Any consumer validating via `Classification.fromString` throws `VALIDATION` on seeded traffic.
27. **`token/identity/` VOs** (`ContractAddress`+spec, `NormalizedAddress`, `TokenLocator`) duplicate chain-validation logic across `token/identity`, `token/normalization` (`NormalizedAddress` again), and `chain/*` (`ChainId`/`Chain`/`ChainFamily`) — three address-validation homes. Consolidate or document the split.

## CONVENTIONS (DEVIATIONS FROM ROOT)

Per-BC layout `api/application/domain/infrastructure` (+ `__tests__/` allowed beside co-located specs in some BCs).
Use cases `<Action><Entity>UseCase` (`KolIngestionOrchestratorUseCase` lives in `kol/identity`, NOT `kol/ingestion`).
Ports in `application/ports/`, impls in `infrastructure/` — except gap 7.
Aliases per-BC (`shared/*`, `token/*`, …), never `@/*`.
**Natural keys**: every pipeline entity keys on `${chain}:${address}` (lowercased).
**Kernel**: extend `AggregateRoot` when the aggregate owns invariants + events, `Entity` for passive objects; promote a VO to shared only when 3+ BCs depend on it (audit payload changes).
**KOL IDs**: numeric Telegram user/channel ID as string (`"123456789"`).

## ANTI-PATTERNS (DEVIATIONS FROM ROOT)

- `@Entity` in domain: FORBIDDEN (TypeORM entities under `infrastructure/persistence/typeorm/`).
- Direct DB writes / events-before-commit: NEVER (`save()` → `commitEvents()` → `publishAll`).
- Cross-BC entity/module sharing: FORBIDDEN (except gap 7 — fix it).
- Raw Telegram text on event bus: FORBIDDEN (fix-1; news path: DB holds `content`, event metadata-only).
- Ticker null in publish flow: reject pre-publisher.
- `*-bug-exploration.spec.ts`: future-fix invariants, do NOT "fix".
- No provider calls inside bug-exploration specs.

## TYPEORM MIGRATIONS (runbook — still accurate, kept)

Generate on entity change for staging/prod; dev/test use `synchronize:true`.

```bash
npm run migration:generate -- -n DescriptiveName
npm run migration:run        # apply (CI runs pre-deploy; abort on failure)
npm run migration:revert     # rollback last
npm run migration:show       # applied vs pending
```

Files: `src/shared/common/persistence/migrations/{timestamp}-*.ts` (`MigrationInterface` up/down).
Hang at boot → check `NODE_ENV`, "Using migrations (synchronize: false)" in logs, `migration:show`.

## OPS (scripts + compose)

- `scripts/seed-pipeline-events.ts` (181 lines): emits 4 events × N tokens (12 real addresses: USDC/SOL/BOME/WBTC/AAVE/CAKE/USDT/CBBTC/MATIC/GME…). ⚠️ Step 4 emits the GHOST `filters.token.*` names (gap 20) with classifications (`LEGITIMATE/RISKY/SAFE`) outside the `Classification` VO set (gap 31) — seeded approvals never reach `TokenApprovedPublishHandler`.
- `scripts/run-migrations.sh` (15 lines): dual-mode — compiled `dist/.../data-source.js` in Docker, `typeorm-ts-node-commonjs` + `src/...` locally. `set -euo pipefail`.
- `scripts/cli/`: interactive readline tools (inject reads `scripts/fixtures/*.json`).
- Compose: `docker-compose.yml` (dev), `.prod.yml` (backend `:3030` + postgres/redis health-gated), `.with-ingestion.yml` (builds ingestion Dockerfile, `PORT: 3031`, backend gets `INGESTION_SERVICE_URL: http://ingestion-service:3031` + read-only media volume, `depends_on` healthy), `.ingestion.yml` (standalone droplet). Healthchecks hit `/api/health` (stub-200 caveat, gap 18 backend / gap 23 ingestion-service).

## NOTES

- `chain/identity/` + `token/identity/` are VO-only libraries (no module, no routes) — shared identifier types, not dead code. `kol/stats` is a stub (leaderboard/ROI per README).
- `shared/common/utils/telegram-html-sanitizer.ts`: Telegram `parse_mode: HTML` allowlist sanitizer for ad/crypto bodies (mirrored by frontend `AdHtmlPreview` — keep both allowlists in sync).
- Staging/prod deploy: `.github/workflows/deploy.yml` (test → ssh → backup → build → `migration:run` → recreate → `:3030/api/health`).
- Architecture docs: `apps/backend/docs/spydefi/arch/` (14 files) + `docs/proyect/{BC,PLAN,DEPLOY}.md` + `docs-money/` (ToS/fix-1).
