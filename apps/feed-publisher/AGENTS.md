# apps/feed-publisher/ — NestJS Knowledge Base

> Verified 2026-09-25 against code. v0.1.0 (source of truth: `package.json`; Tramo 2 scaffold, todos 1-5).
> Decisions cited as Pxx come from `.omo/drafts/mega-refactor-tramos.md` §7.6 (2026-09-24).
> Cross-tramo contracts pinned in `.omo/plans/mega-refactor-central.md` v2026-09-24;
> feed-publisher plan in `.omo/plans/mega-refactor-feed-publisher.md` (12 todos).
> Spec base: `.kiro/specs/refactor-feed-publisher/` (11-refactor 3437 lines).

Contents: OVERVIEW · PROGRAM INDEX · COMMANDS · STRUCTURE · MODULES · ENV INVENTORY · PORTS · HEALTH ·
TS/ESLINT CONVENTIONS · TESTS · GAPS · DECISIONS · STANDING RULE · NOTES

## OVERVIEW

NestJS 11 service (Tramo 2 of the mega-refactor) that will own all feed
outside the monolith: ingestion (HTTP+SSE) → matching/keywords/filters →
unified queue (`contentType`) + dedup → LLM → scheduling/ads → telegram
(crypto + threads) publishing, with threads as skeleton + v2 contract only.
Built today (todo 1): Config + `GET /api/health` + 10 empty feature-module
stubs + full `src/shared/` transversal. NO business logic yet.

Design pivots that govern every future todo:

- **P10 — strict type separation**: this app subscribes ONLY to
  `messageType==='crypto-news'`. Subscribing to `'kol'` is PROHIBITED
  (kol lives in kol-system). No vip-calls, no KOL_BOT here — ever.
- **C-FLAGS-01 — 3-flag control**: matching / llm / publishing are
  independent; LLM generation runs ONLY when llm AND publishing are on.
- **C-SSE-01 — dual-path ingestion**: SSE filtered to feed +
  polling fallback, `x-api-key` (`INGESTION_TELEGRAM_API_KEY`) from day one.
- **C-DB-01 — own logical DB**: `onchain_bot_feed_publisher[_staging]`
  on the same server as the backend DB per env.
- **C2 — second shared move**: telegram crypto+threads adapters are the
  second C-SHARED-01 move (first was kol-system KOL-bot, todo 11).
- **Threads v1 = skeleton + C1 contract** (todo 8): same 501s Tramo 1 fixed,
  never implemented here.

## PROGRAM INDEX

| Todo | Status                                                        | What                                                                                                            |
| ---- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 0    | DONE (evidence `.omo/evidence/task-T2-01-feed-publisher.log`) | Precondition Gate T1: 9/9 backend `@deprecated` headers + T1 suites signal + `telegram/shared` clean of KOL-bot |
| 1    | DONE (this scaffold)                                          | App setup + shared transversal, green                                                                           |
| 2    | DONE (evidence `.omo/evidence/task-T2-02.log`)                | Ingestion feed HTTP+SSE (SSE-only, catch-up by cursor, x-api-key day one)                                       |
| 3    | DONE (evidence `.omo/evidence/task-T2-03.log`)                | Matching + keywords + filters (18 suites / 64 tests, wired)                                                     |
| 4    | DONE (evidence `.omo/evidence/task-T2-04.log`)                | Queue unificada + deduplication (18 suites / 76 tests, wired)                                                   |
| 5    | DONE (evidence `.omo/evidence/task-T2-05.log`)                | LLM config+templates+core+playground (19 suites / 62 tests, wired, drain rebind)                                |
| 6    | TODO                                                          | Scheduling/ads + media library                                                                                  |
| 7    | TODO                                                          | Telegram crypto+threads adapters (C2)                                                                           |
| 8    | TODO                                                          | Threads esqueleto + contrato C1                                                                                 |
| 9    | TODO                                                          | Frontend 4 endpoints + flags UI                                                                                 |
| 10   | TODO                                                          | Staging 7d + rollback rehearsal                                                                                 |
| 11   | TODO                                                          | Cutover + cleanup (`USE_FEED_PUBLISHER`)                                                                        |

## COMMANDS

```bash
npm run dev -w @onchain-bot/feed-publisher   # watch, :3040
npm test -w @onchain-bot/feed-publisher      # jest, all specs
npm run build -w @onchain-bot/feed-publisher # nest build -> dist/main.js
curl -s localhost:3040/api/health               # {"status":"ok"}
docker compose -f apps/feed-publisher/docker-compose.yml up -d  # pg :5436 + redis :6383
```

## STRUCTURE

```
apps/feed-publisher/
  src/main.ts            # bootstrap :3040 (FEED_PUBLISHER_PORT) + ValidationPipe
  src/app.module.ts      # Config global + Health + 10 stub modules
  src/health/            # GET /api/health static stub
  src/ingestion/         # BUILT (todo 2, wired): FeedIngestionClient
                         # (SSE-only + catch-up by cursor, backoff 1s→30s) +
                         # ProcessFeedMessageHandler (seen-key dedup) +
                         # IngestionHttpClientAdapter (?type=crypto-news, x-api-key)
                         # + DTOs + port + IngestionHealthIndicator (P21 hook)
  src/matching/          # BUILT (todo 3, wired): FilteredFeedService
                         # (typed crypto-only fetches, foreign rows dropped
                         # client-side) + MatchingEvaluator (pure OR/AND-group/
                         # blacklist/album-merge core) + EvaluateMessageMatch
                         # (single-message dry-run) + EnqueueMatchingCronScheduler
                         # (MATCHING_CRON_ENABLED + DB flag, dynamic 1/5min,
                         # overlap guard, adaptive re-poll, health state) +
                         # MatchingConfig entity + in-memory repo (TypeORM shape
                         # ships unwired, GAP-1) + IngestionFeedAdapter (text-only
                         # rows, media: [] — PublisherQueueEntry carries
                         # imagePaths[] but enqueue maps none yet;
                         # media-aware fetch deferred to todo 6/7) +
                         # QueueMatchedMessageAdapter (LIVE binding since
                         # todo 4; collector now test-double only) +
                         # controller + input DTO + health hook
  src/keywords/          # BUILT (todo 3, wired): Keyword / BlacklistPhrase
                         # aggregates (exact|substring, channel scope, media gate)
                         # + compound AND-group evaluator + allowed/blacklist
                         # matchers + PhraseRegistryService (409 intra/cross-table)
                         # + CRUD + batch AND-group use-cases + in-memory repos
                         # (TypeORM shapes + mappers unwired, GAP-1) + 2
                         # controllers + DTOs + health hook
  src/filters/           # BUILT (todo 3, wired): ContentFilterService
                         # (ReDoS-safe: 512-char cap, flags whitelist, compiled
                         # cache, 100ms overrun warn, invalid skip) +
                         # ChannelContentFilterConfig entity (opaque channelId,
                         # FK-less) + CRUD/toggle/list use-cases + in-memory repo
                         # (TypeORM shape unwired, GAP-1) + controller + DTOs +
                         # health hook
  src/queue/             # BUILT (todo 4, wired): PublisherQueueEntry
                         # (contentType discriminator, PENDING->SCHEDULED->
                         # PUBLISHING->PUBLISHED + FAILED/BLOCKED terminals,
                         # PUBLISHING->PENDING retry release) + QueueManager
                         # (strict QUEUE_MAX_PENDING=36 cap -> QueueFullError,
                         # oldest-first drain, TTL expiry) +
                         # EnqueueMatchingMessage (media-gate, dedup probe
                         # fail-open, BLOCKED-with-refs vs null replay) +
                         # ProcessNextQueuedArticle (1/tick drain, raw render
                         # + in-memory dispatch until todos 5/7, retry to
                         # LLM_MAX_ATTEMPTS=3, not-configured release) +
                         # QueueMatchedMessageAdapter (LIVE
                         # MatchedMessageEnqueuePort binding; collector now
                         # test-double only) + schedulers (drain 1min +
                         # TTL-expire 30min, default 24h) + GET/DELETE
                         # /api/queue + stats + TypeORM shape/mapper unwired
                         # (GAP-1) + health hook
  src/deduplication/     # BUILT (todo 4, wired): DeduplicationService
                         # cascade exact->content->semantic (fail-open:
                         # store/embedding outages never block) +
                         # normalizers (content/url) + ContentHash +
                         # DedupScorer (duplicate >0.95 / gray 0.6, gray
                         # never blocks) + cosine scorer + DedupRecord +
                         # Fingerprint (exact|content|url|semantic) +
                         # embeddings (OpenAI text-embedding-3-small when
                         # keyed, else deterministic mock; storage: plain
                         # `dedup_fingerprints` table, NO pgvector) +
                         # in-memory store (GAP-1, TypeORM shape unwired) +
                         # health hook
  src/llm/               # BUILT (todo 5, wired): LlmConfig
                         # (single-row id=1, fail-closed seed, shouldGenerateLlm
                         # = llm AND publishing, C-FLAGS-01) + pipeline-flags
                         # (pure 8-combo truth-table resolver + mode) +
                         # PromptTemplate (GLOBAL catalog P33/P34:
                         # contentType crypto-news|threads|global, GLOBAL
                         # applies everywhere) + latin-script-validator
                         # (pure non-Latin finder) + FeedLlmGenerator
                         # (keyword-bound > default resolution, single-pass
                         # {{title}}/{{original}}/{{hasImage}} render,
                         # vision fail-open, vision auto-disable, mock
                         # short-circuit, LlmFailedError wrap) +
                         # LlmArticleRendererAdapter (LIVE
                         # QueuedArticleRendererPort binding: raw passthrough
                         # unless llm AND publishing, empty + non-Latin
                         # rejection -> FAILED + cron retry downstream) +
                         # PreviewPromptUseCase (transient entry, render or
                         # one generation, NEVER persists) + GetLlmModels
                         # (gateway /v1/models, 5s timeout) +
                         # GetPipelineFlags (matching + llm compose) +
                         # gateway (default) / mock (USE_MOCK_AI) adapters +
                         # in-memory repos (fail-closed config seed,
                         # default-feed GLOBAL seed; TypeORM shapes +
                         # mappers unwired, GAP-1) + 3 controllers
                         # (/api/llm config+flags, /api/llm/templates CRUD
                         # with 409 in-use, /api/llm preview+models) +
                         # health hook
  src/scheduling/        # STUB (todo 6)
  src/threads/           # STUB (todo 8, v1 skeleton only)
  src/telegram/          # STUB (todo 7, crypto+threads)
  src/shared/            # transversal (DONE, tested)
    config/              # app + database + redis + telegram namespaces
    kernel/              # AggregateRoot/Entity/ValueObject/DomainEvent/DomainError
    value-objects/       # ContentTypeVo (feed|threads), ContentId
    events/              # feed-publisher.queue.queued / telegram.published|failed
    exceptions/          # QueueFull/LlmFailed/PublishFailed errors
    typeorm/             # TypeOrmBase + SnakeCaseNamingStrategy
    http/                # SharedHttpClient (axios) + RetryPolicy (bounded backoff)
    cache/               # CachePort + InMemoryCacheAdapter (Redis later)
    messaging/           # EventBusPort + InMemoryEventBusAdapter
    monitoring/          # MetricsService (counters/gauges, Prometheus-shape)
    security/            # x-api-key helpers (fail-open when empty)
    decorators/          # @Public()
    filters/             # DomainExceptionFilter (DomainError -> HTTP)
    guards/              # ApiKeyGuard (FEED_PUBLISHER_API_KEY)
```

## MODULES

7 feature modules remain `@Module({})` stubs with a `*.module.spec.ts`
compile test pointing at the todo that fills them. `IngestionModule`
(todo 2, wired): `FeedIngestionClient` (SSE-only feed
client — accepts ONLY `data.messageType==='crypto-news'`, foreign type
rejected by negative assert, P10; reconnect catch-up by cursor, NO
periodic polling; backoff 1s doubling → 30s cap; `x-api-key` on SSE
from day one, P30) + `ProcessFeedMessageHandler` (one frame at a
time, `channelId:messageId` seen-key = double-delivery guard) +
`IngestionHttpClientAdapter` (`FeedIngestionClientPort` impl:
`GET /api/feed/sources?type=crypto-news` + `/api/feed/messages?type=…`,
base `INGESTION_TELEGRAM_URL`, `x-api-key` from day one, fail-open `[]`)

- `MatchingModule` (todo 3, wired — imports Ingestion/Keywords/Filters):
  `FilteredFeedService` + `MatchingEvaluator` +
  `EvaluateMessageMatchUseCase` + `EnqueueMatchingCronScheduler` +
  single-row `MatchingConfig` (fail-closed seed) + `FeedPort`
  (`IngestionFeedAdapter`) + `MatchedMessageEnqueuePort`
  (`QueueMatchedMessageAdapter` into the unified queue since todo 4;
  the in-memory collector remains as a test double only) +
  `MatchingConfigController` (`GET/PATCH config`, `GET health` frozen
  6-field view, `queuePending` reads the unified queue since todo 4) +
  `MatchingHealthIndicator` (P21 hook)
- `QueueModule` (todo 4, wired — imports DeduplicationModule):
  `PublisherQueueEntry` + `QueueManager` + `EnqueueMatchingMessage` +
  `ProcessNextQueuedArticle` + `QueueMatchedMessageAdapter` +
  `RawContentRendererAdapter` (todo 5 replaces with LLM) +
  `InMemoryQueuedArticleDispatcher` (todo 7 replaces with Bot API) +
  drain/TTL schedulers + `QueueController` (`GET /api/queue/stats`,
  `GET /api/queue`, `DELETE /api/queue/:id`) + `QueueHealthIndicator`
  (P21 hook)
- `DeduplicationModule` (todo 4, wired): `DeduplicationService` +
  normalizers/scorers + `DedupRecord` + `Fingerprint` + embedding
  selector (OpenAI vs mock) + `DeduplicationHealthIndicator` (P21 hook)
- `KeywordsModule` (todo 3, wired): `Keyword` / `BlacklistPhrase` +
  matchers + `PhraseRegistryService` + CRUD/batch use-cases +
  `KeywordsController` + `BlacklistController` + health hook
- `FiltersModule` (todo 3, wired): `ContentFilterService` +
  `ChannelContentFilterConfig` (opaque channelId, FK-less) + use-cases +
  `FiltersController` + health hook.
- `LlmModule` (todo 5, wired — imports Keywords + Matching via
  forwardRef): `LlmConfig` + `PromptTemplate` (GLOBAL catalog) +
  `FeedLlmGenerator` + `LlmArticleRendererAdapter` (LIVE drain render
  binding) + playground + models + flags use-cases + 3 controllers +
  `LlmHealthIndicator` (P21 hook). `QueueModule` rebinds
  `QueuedArticleRendererPort` to the LLM renderer via
  `forwardRef(() => LlmModule)` (raw adapter deleted); the old
  `llm.module.spec.ts` + `queue.module.spec.ts` stubs now boot with a
  global `ConfigModule` (transitive IngestionModule needs it).
  3 modules still stubs (scheduling, threads, telegram).

* tolerant DTOs (`raw-feed-message.dto`, `feed-source.dto`)
* `IngestionHealthIndicator` (`{ component: 'ingestion', status }`,
  P21 hook point, provided + exported, unwired until composite health).
  SharedModule is `@Global()`
  (config namespaces + guard + filter + cache/event-bus ports in-memory +
  metrics + HTTP client).

## ENV INVENTORY

`.env.example` (27 vars): switches (`FEED_PUBLISHER_ENABLED`,
`USE_FEED_PUBLISHER`), port, `FEED_PUBLISHER_API_KEY` (inbound,
fail-open), `INGESTION_TELEGRAM_URL` + `INGESTION_TELEGRAM_API_KEY`
(outbound x-api-key, P30 day-one), `ENCRYPTION_KEY`, `DATABASE_URL` +
`DATABASE_SYNCHRONIZE`, `REDIS_URL`, 3-flag (`MATCHING_ENABLED`,
`LLM_ENABLED`, `PUBLISHING_ENABLED`, C-FLAGS-01) + `MATCHING_CRON_ENABLED`,
queue bounds (`QUEUE_TTL_HOURS=24`, `QUEUE_MAX_PENDING`), `DEDUP_ENABLED`,
LLM (`USE_MOCK_AI`, `OPENAI_API_KEY`, `LLM_MODEL`, `LLM_MAX_ATTEMPTS=3`),
ads (`ADS_ENABLED`, `ADS_ROTATION_EVERY_N`), telegram
(`CRYPTO_NEWS_BOT_TOKEN`, `THREADS_BOT_TOKEN`,
`TELEGRAM_RATE_LIMIT_PER_MINUTE`). Templates for staging (:3041) + prod
(:3042) next to the app. BotAPI = raw axios over Telegram Bot HTTP API
(same as backend adapter) — no extra dep.

## PORTS

| Env     | App   | Postgres      | Redis         |
| ------- | ----- | ------------- | ------------- |
| dev     | :3040 | :5436         | :6383         |
| staging | :3041 | server-shared | server-shared |
| prod    | :3042 | server-shared | server-shared |

No clashes with backend (:3030), ingestion (:3031), frontend (:5173),
kol-system (:3050, pg :5435, redis :6382).

## HEALTH

`GET /api/health` -> `{ status: 'ok' }` (static stub; composite probes land
with later todos and never claim liveness they don't have).
`GET /api/queue/stats` -> queue depth + drain health (todo 4, live).

## TS/ESLINT CONVENTIONS

Mirrors kol-system/backend: `singleQuote`, strictNullChecks/noImplicitAny,
`emitDecoratorMetadata` + `experimentalDecorators`, path aliases
`shared/*`, `telegram/*`, `src/*`. No `@/*` alias here.

## TESTS

Jest (`testRegex: .*\.spec\.ts$`, `--forceExit --runInBand`). Failing-first:
every module/primitive landed with its spec in the same todo. Shared
coverage target >80% (pure units, no I/O).

## GAPS

1. Persistence entities/migrations (TypeORM wiring, `synchronize:false` outside dev).
2. `/metrics` exporter + Pino logging (MetricsService is in-memory shape only).
3. Redis adapters (cache + BullMQ queue backend use `REDIS_URL`).
4. `EnrichmentPort` dual local/HTTP (G-17, mirrors Tramo 1).
5. Frontend sub-table + `VITE_FEED_PUBLISHER_URL` (todo 9).
6. Deploy workflows (staging/prod) + rollback rehearsal (todo 10).

## DECISIONS

- P30 applied: `INGESTION_TELEGRAM_API_KEY` in `.env.example` day one;
  Dockerfile CMD `dist/main.js`; app-level `npm run dev`; lockfile synced;
  this AGENTS.md created viva from todo 1.
- Root `package.json` untouched (no `dev:feed-publisher` alias — same as
  kol-system; run via `-w @onchain-bot/feed-publisher`). Kept read-only
  outside `apps/feed-publisher/` except the mandated lockfile sync.
- Deps mirror backend versions (axios ^1.18.0, ioredis ^5.4.1, openai
  ^6.45.0) + BullMQ ^5.12.0 (queue backend, wired in todo 4).
- P32 applied (todo 2): zero foreign-type token in new ingestion code —
  the single `'kol'` string in `src/` lives in the SSE negative assert
  (`feed-ingestion-client.service.spec.ts:35`); `api-key.ts`
  comment reworded to "sibling extraction service". Pre-existing P10
  rationale comments elsewhere still name the foreign type as
  documentation (out of scope for this todo).
- Todo 3 (P25): matching/keywords/filters ported reference read-only
  from backend `feed-integration` + `feed-publisher`
  keyword/filter code + `ingestion/feed` filter service; nothing
  outside `apps/feed-publisher/` touched (lockfile untouched — no new
  deps: `cron` + `@nestjs/swagger` resolve via hoisted root modules,
  same as todo 2). P10/P32 grep gates green (patterns in NOTES below;
  verified empty in the three new modules). Overlap-guard race
  fixed by claiming `isPolling` before the first await (a same-macrotask
  tick slipped through otherwise — caught by spec). TypeORM shapes for
  all three modules ship UNWIRED (no forRoot in this app yet) with
  in-memory adapters live (backend `DATABASE_ENABLED=false` pattern);
  wiring is GAP-1. Feed rows are text-only (`media: []`) until todo 4
  lands media-aware fetches (album merge already implemented against
  the typed shape). 18 suites / 64 tests green + full 55/137 + `tsc`
  clean + `nest build` clean.
- Todo 4 (P25): queue + dedup ported reference read-only from backend
  `crypto-news-publisher` queue (entity/use-cases/schedulers/controller)
  - `shared/deduplication` (cascade/normalizers/scorers/embeddings);
    nothing outside `apps/feed-publisher/` touched (lockfile untouched —
    no new deps: `openai` was already a dep, `cron` + `@nestjs/swagger`
    resolve via hoisted root modules). P10/P32 grep gates green
    (verified empty in queue/deduplication/matching). Failing-first: 14
    new spec files red on missing modules, then green. Deliberate
    deviations from the backend: (a) strict `QUEUE_MAX_PENDING` cap throws
    `QueueFullError` (409) instead of overflow-eviction — backpressure is
    visible on staging dashboards; (b) no Postgres advisory lock on the
    drain (single instance until GAP-3; overlap guard covers double
    ticks); (c) dedup has no LLM arbiter tier (gray_zone always
    fail-open); (d) embeddings are OpenAI/mock (no local Xenova model).
    Storage decision: plain `dedup_fingerprints` table, NO pgvector
    (vetoable in review). TypeORM shapes + mappers for both modules ship
    UNWIRED (GAP-1) with in-memory adapters live. Feed rows stay
    text-only (`media: []`; entity carries `imagePaths[]` for todo 6/7).
    18 suites / 76 tests green for queue+dedup + full 71/211 + `tsc`
    clean + `nest build` clean + boot smoke (`GET /api/queue/stats`
    `{"pending":0,...}`). Mid-todo the tree renamed
    `content-publisher` -> `feed-publisher` (co-agent) with `crypto-news`
    symbols -> `feed` symbols; `contentType` values + `messageType`
    stay `'crypto-news'|'threads'` / `'crypto-news'`. One blind-rename
    artifact fixed (`feed:` id expectation in the entity spec).
- Todo 5 (P25): LLM stack ported reference read-only from backend
  `crypto-news-publisher` LLM code (llm-config + prompt-template
  entities/validators, gateway/mock adapters, preview use-case,
  llm-config controller/input, latin validator, get-models use-case);
  nothing outside `apps/feed-publisher/` touched (lockfile untouched —
  no new deps: `openai` was already a dep, `cron` + `@nestjs/swagger`
  resolve via hoisted root modules). P10/P32 grep gates green
  (verified empty incl. `src/llm/`). Failing-first: 4 domain specs red
  on missing modules, then green; 19 suites / 62 tests for llm + full
  89/272 + `tsc` clean + `nest build` clean + boot smoke (playground
  preview curl with mock, queue stats unchanged). Deliberate
  deviations from the backend: (a) GLOBAL template catalog gains a
  `contentType` scope (`crypto-news|threads|global`, P33/P34 —
  backend templates are crypto-only); (b) errors are `LlmFailedError`
  (this app's taxonomy) instead of plain `Error`; (c) entries carry
  `imagePaths[]` (first readable file feeds vision; backend used
  single `imagePath`); (d) `QueueModule` rebinds its renderer token to
  the LLM adapter now (the raw adapter file is deleted); (e) no
  target-channel Bot API check on PATCH config (todo 7 owns the
  publisher port); (f) gateway reads flat `LLM_GATEWAY_*` env
  (fallback `OPENAI_API_KEY`, `.env.example` extended) instead of the
  backend `app.llm.gateway` namespace. Gateway-down adversarial:
  generator wraps in `LlmFailedError` -> drain `failOrRetry` to
  `llmMaxAttempts` then FAILED (existing queue path, spec-covered).
  TypeORM shapes + mappers for both llm tables ship UNWIRED (GAP-1)
  with in-memory adapters live. Worktree left dirty (no commit).

## STANDING RULE

Update this file on every todo (program index + gaps + decisions). Stale
knowledge base = failed todo.

## NOTES

- P10 enforced by grep gate: `grep -rn "vip-calls\|KOL_BOT\|kol-bot" apps/feed-publisher/src` must stay empty.
- Bot tokens OPTIONAL at boot (dashboard-only mode); adapters fail with a
  clear error when absent (todo 7).
