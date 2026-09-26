# apps/feed-publisher/ — NestJS Knowledge Base

> Verified 2026-09-25 against code + `.omo/evidence/task-T2-*.log`
> (counts re-verified per log, see PROGRAM STATUS). v0.1.0 (source of
> truth: `package.json`; Tramo 2, todos 0-8+12+14 DONE, 9-11 pending).
> Renamed `content-publisher` -> `feed-publisher` mid-todo-4 (co-agent).
> Decisions cited as Pxx come from `.omo/drafts/mega-refactor-tramos.md`
> §7.6 (2026-09-24, P30-P39 2026-09-25, P50 2026-09-25).
> Cross-tramo contracts pinned in `.omo/plans/mega-refactor-central.md`
> v2026-09-24;
> feed-publisher plan in `.omo/plans/mega-refactor-content-publisher.md`
> (13 todos: 0-12; filename predates the rename).
> Spec base: `.kiro/specs/refactor-feed-publisher/` (11-refactor 3437 lines).

Contents: OVERVIEW · PROGRAM INDEX · PROGRAM STATUS · GATEWAY
MIGRATION (todo 5) · COMMANDS ·
STRUCTURE · MODULES · ENV INVENTORY · PORTS · HEALTH ·
TS/ESLINT CONVENTIONS · TESTS · GAPS · DECISIONS INDEX · DECISIONS ·
STANDING RULE · NOTES

## OVERVIEW

NestJS 11 service (Tramo 2 of the mega-refactor) owning all feed
outside the monolith: ingestion (SSE-only + cursor catch-up) →
matching/keywords/filters → unified queue (`contentType`) + dedup →
LLM (global catalog) → scheduling/ads (P38 per-target delay+caps) →
telegram (crypto + threads) publishing + template/sessions
multi-tab (P33/P34) + ownership-enforced publish auth (P50), with
threads as skeleton +
v2 contract only (C1). Todos 0-8+12+14 DONE and wired (13 modules in
`app.module.ts`); todos 9-11 pending (frontend, staging, cutover).
See PROGRAM STATUS for the verified tally.

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

> Evidence filenames below are the REAL names on disk
> (`.omo/evidence/task-T2-01-content-publisher.log` for todo 1,
> `task-T2-02..08.log` for todos 2-8). Counts re-verified 2026-09-25
> by grep over those logs; any count that cannot be re-verified is
> marked UNVERIFIED (none currently).

| Todo | Status                                                                      | What                                                                                                                                            |
| ---- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | DONE (evidence `.omo/evidence/task-T2-01-feed-publisher.log`\*)             | Precondition Gate T1: 9/9 backend `@deprecated` headers + T1 suites signal + `telegram/shared` clean of KOL-bot                                 |
| 1    | DONE (evidence `.omo/evidence/task-T2-01-content-publisher.log`)            | App setup + shared transversal (34 suites / 56 tests; legacy batch 52/452 green alongside)                                                      |
| 2    | DONE (evidence `.omo/evidence/task-T2-02.log`)                              | Ingestion feed SSE-only + cursor catch-up + x-api-key day one (7 suites / 21 tests; full 40/76)                                                 |
| 3    | DONE (evidence `.omo/evidence/task-T2-03.log`)                              | Matching + keywords + filters (18 suites / 64 tests, wired)                                                                                     |
| 4    | DONE (evidence `.omo/evidence/task-T2-04.log`)                              | Queue unificada + deduplication (18 suites / 76 tests, wired; full 71/211)                                                                      |
| 5    | DONE (evidence `.omo/evidence/task-T2-05.log`)                              | LLM config+templates+core+playground (19 suites / 62 tests, wired, drain rebind; full 89/272)                                                   |
| 6    | DONE (evidence `.omo/evidence/task-T2-06.log`)                              | Scheduling/posts + media library (18 suites / 72 tests, wired, P38 per-target delay+caps; full 106/343)                                         |
| 7    | DONE (evidence `.omo/evidence/task-T2-07.log`)                              | Telegram crypto+threads adapters (C2, 9 suites / 32 tests; recorded against todo-8 red phase, fixed in todo 8)                                  |
| 8    | DONE (evidence `.omo/evidence/task-T2-08.log`)                              | Threads esqueleto + contrato C1 (14 suites / 54 tests, wired; full 127/429)                                                                     |
| 9    | TODO                                                                        | Frontend 4 endpoints + flags UI                                                                                                                 |
| 10   | TODO                                                                        | Staging 7d + rollback rehearsal                                                                                                                 |
| 11   | TODO                                                                        | Cutover + cleanup (`USE_FEED_PUBLISHER`)                                                                                                        |
| 12   | DONE (evidence `.omo/evidence/task-T2-12.log`)                              | `src/template/` + `src/sessions/` multi-tab (P33+P34, blocks 9, 11)                                                                             |
| 13   | DONE (backend-side, no code here)                                           | Dual-serve contract: backend dual-serves old+new until cutover (see NOTES P41)                                                                  |
| 14   | DONE (evidence `.omo/evidence/task-14-mega-refactor-content-publisher.log`) | Auth anti-exploit (P50): global API-key guard (401) + ownership-enforced publish (403) + rate-limit (429) + audit log + secret-scan + drill doc |

\* Todo-0 log name (`task-T2-01-feed-publisher.log`) collides with the
todo-1 naming scheme on disk; content verified as the Gate T1 log.

## PROGRAM STATUS

Todos 0-8+12+14 DONE (verified 2026-09-25 against code + evidence logs):

- Wired modules: 12 feature (ingestion, matching, keywords, filters,
  queue, deduplication, llm, scheduling, threads, telegram,
  template, sessions) + health.
  0 stubs remain.
- Cumulative full-suite tally: 150 suites / 483 tests green
  (143/460 at todo 12 + 7/23 new in todo 14).
- P10/P32 grep gates green (crypto-news only, zero foreign-type
  token outside the SSE negative assert). P38 per-target
  delay+caps live in scheduling. C-FLAGS-01 3-flag control live in
  llm/queue. C2 telegram adapters live with Bot API bindings.
  Threads v1 = skeleton + `src/threads/CONTRACT.md` (C1).
- P50 auth anti-exploit live: global `ApiKeyGuard` (APP_GUARD, 401 on
  mismatch — only `@Public()` health skips it) + global
  `DomainExceptionFilter` (APP_FILTER, 403/429/404 survive the wire) +
  `POST /api/sessions/:id/publish` behind `SessionPublishAuthorizer`
  (owned session x target binding + admin-verified bot + verified
  channel, every violation 403 with no existence leak) +
  per-session `PublishRateLimiter` (10/min default, 429, audited) +
  `GET /api/publish-audit` (routing facts only, never tokens) +
  secret-scan gate spec + `docs/compromise-drill.md`. The cron
  planner enforces the same ownership rules fail-safe (skips).

Todos 9-11 PENDING (not started, no evidence):

- 9 frontend sub-table + flags UI (now unblocked: templates/sessions
  CRUD are the tab backends); 10 staging 7d + rollback
  rehearsal; 11 cutover + backend feed cleanup.
- Plan-file lag: `.omo/plans/mega-refactor-content-publisher.md`
  still shows 7/8 unchecked — evidence logs prove both DONE;
  plan checkboxes need a sync (out of scope: read-only here).

Worktree state 2026-09-25: DIRTY (uncommitted: todo-7/8 telegram +
threads trees, `.env.*` templates, telegram/threads module wiring).
No commit per todo convention (worktree left dirty, no commit).

## GATEWAY MIGRATION (telegram-bots-gateway todo 5, DONE 2026-09-26)

Feed publishing via the gateway with dual-send parity (mirrors the
kol-system todo-4 pattern). Mode stays `dual` — NO cutover in this todo
(adversarial: any divergence blocks cutover via `assertNoDivergence`).

- **Path** (`FEED_PUBLISH_MODE`, default `dual`): `direct` = legacy
  adapters only (deprecated); `dual` = gateway + direct, compare via
  `DualSendParityService`, return the direct leg; `gateway` = gateway
  vault id only, fail-closed (cutover rehearsal, proven live).
- **New code** (`src/telegram/`, all inside this app): `domain/ports/
bots-gateway-sender.port.ts` (token never crosses — vault `botId`
  only) + `infrastructure/gateway/` (`gateway-hmac-signer` — canonical
  `METHOD\npath\nts\nnonce\nsha256(rawBody)`, keyless dev returns `{}`;
  `gateway-send-client` — message/photo-URL/media_group chunks with
  per-chunk `client_msg_id`, global `fetch`; `gateway-bot-mapping` —
  local→vault ids, unmapped falls back; `publish-mode` helper) +
  `application/services/dual-send-parity.service.ts` (outcome-only
  compare — `messageId`s never compared; incompatible shapes recorded
  as `skipped`, never diverged; `assertNoDivergence()` throws CONFLICT)
  - `application/use-cases/migrate-bots-to-gateway.use-case.ts`
    (TemplateBot catalog vault-to-vault + crypto/threads env bots,
    labels/ids only in results) + `api/http/
gateway-migration.controller.ts` (`POST
/api/content-template-bots/migrate-to-gateway`, 201).
- **Wiring**: queue + scheduling dispatchers run the gateway leg beside
  the direct leg in `dual` (text-only shapes; local files / video /
  button ads skip — the gateway `SendDto` covers message + photo-URL +
  media_group-URL only, no upload, no `reply_markup`); `gateway` mode
  is fail-closed for those shapes. `TelegramModule` imports
  `ContentTemplatesModule` for the migration repos + encryption;
  `SessionsModule` imports `TelegramModule` (forwardRef) so explicit
  session publishes resolve vault ids (live plan carries the vault id)
  - `GatewaySessionPublisher` provided/exported (recorder stays live
    until gateway todo 7). Legacy crypto/threads/base adapters are
    `@deprecated` (dual-leg only, removed at gateway todo 7). Backend
    legacy mirrors untouched (deprecate at cutover, todo 7).
- **Flat-env deviation** (vs kol-system): this app never loads the
  `telegram` namespace (`AppModule` has no `load:` — adapters read flat
  `config.get('CRYPTO_NEWS_BOT_TOKEN')`), so gateway client fields
  read FLAT first (`BOTS_GATEWAY_URL/_CLIENT_ID/_CLIENT_SECRET`,
  `FEED_PUBLISH_MODE`) with the namespace as fallback. Operator wiring:
  vault migration needs an `admin`-scoped gateway client (send scope
  alone 403s — hit live); DISTINCT secrets per env.
- **Evidence**: `.omo/evidence/task-5-telegram-bots-gateway.log` —
  159 suites / 513 tests green (+9/+30), `tsc` + `nest build` clean,
  live dual publish-now (direct 401 vs gateway 777 — environmental
  divergence, gate correctly closed) + live gateway-mode 777 (token
  never resolved) + live session vault-id plan + 0 token leaks.
- **Known cutover blockers** (gateway todo 7): local-file media legs,
  video, button ads need gateway upload/`reply_markup` support (or stay
  dual); vault mapping is in-memory (persisted at global cutover).

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
   src/scheduling/        # BUILT (todo 6, wired): ScheduledAd
                          # (immutable catalog, per-format media invariants,
                          # expiry sweep) + SchedulingConfig (single-row
                          # id=1, fail-closed, P38 per-target publishDelayMs
                          # + dailyCap for telegram|threads) +
                          # SchedulingState (global postsSinceLastAd cadence
                          # + per-target cursor/counter/dayKey) +
                          # RotationDeciderService (pure 6-way decision incl.
                          # publish-delay-not-met + held daily-cap-reached)
                          # + PublishScheduledAdUseCase (per-tick per-target
                          # orchestration, disable-after-3, not-configured
                          # never burns) + PublishScheduledAdNowUseCase
                          # (decider bypass, no failure bookkeeping) +
                          # upload/clear/reuse media use-cases (magic-byte
                          # sniff, library sha256 dedup, replace-safe) +
                          # AdMediaLibraryEntry (FK-less, content-deduped) +
                          # in-memory repos (LIVE) + TypeORM shapes/mappers
                          # unwired (GAP-1) + LocalSchedulingMediaStorage
                          # (`uploads/ads/<ad>/<uuid>` + `uploads/
                          # ads-library/<hash>`) + in-memory dispatcher
                          # (todo 7 binds Bot API) + cron 1min (sweep even
                          # when OFF, cadence reset once per tick) +
                          # 3 controllers (/api/scheduling/ads,
                          # /api/scheduling/rotation-config,
                          # /api/scheduling/media + library, Range/206) +
                          # health hook
   src/threads/           # BUILT (todo 8, wired): `Thread` +
                          # `ThreadMessage` aggregates (DRAFT->QUEUED->
                          # IN_PROGRESS->COMPLETED, PARTIAL resume from
                          # `messagesPublished`, FAILED terminal,
                          # transient backoff 1s→30s) +
                          # `ThreadBuilderService` (orchestrator) +
                          # `ThreadSchedulerService` (cumulative-delay
                          # sequencing) + 3 use-cases
                          # (create/enqueue/publish) +
                          # `ThreadPublisherCronScheduler` (1min,
                          # `THREADS_CRON_ENABLED`, overlap guard) +
                          # in-memory repo + in-memory publisher (todo 7
                          # `ThreadsBotApiAdapter` is the v2 binding) +
                          # `POST/GET /api/threads*` 501 stub (same code
                          # as the Tramo 1 template stub) + C1
                          # un-stubbing contract (`CONTRACT.md`) +
                          # TypeORM shapes/mapper unwired (GAP-1) +
                          # health hook
   src/telegram/          # BUILT (todo 7, wired): `TelegramPublisherPort`
                          # + `CryptoNewsBotApiAdapter` (moved read-only
                          # from backend `BotApiCryptoNewsPublisherAdapter`)
                          # + `ThreadsBotApiAdapter` (new, same send
                          # semantics, own token/budget) + shared
                          # `BaseBotApiAdapter` (split/format/multipart) +
                          # `BotApiHttpClient` (token-agnostic node:https
                          # transport) + `TelegramPublisherRouter`
                          # (contentType/target routing, fail-closed) +
                          # per-bot `TelegramRateLimiter` (fixed 60s
                          # window) + LIVE queue/scheduling dispatchers +
                          # `TelegramHealthIndicator` (P21 hook)
                          # GATEWAY (bots-gateway todo 5, dual mode):
                          # `domain/ports/bots-gateway-sender.port.ts`
                          # (vault-id only, no token) +
                          # `infrastructure/gateway/` (hmac-signer,
                          # send-client, bot-mapping, publish-mode) +
                          # `DualSendParityService` (outcome-only ledger +
                          # CONFLICT cutover gate) +
                          # `MigrateBotsToGatewayUseCase` (catalog +
                          # env bots → vault) + `GatewayMigrationController`
                          # (`POST .../migrate-to-gateway`) — direct
                          # adapters @deprecated (dual-leg only)
   src/template/          # BUILT (todo 12, wired; renamed from
                          # src/content-templates/ 2026-09-25, dir only:
                          # `ContentTemplatesModule`, `PublishingContentTemplate`,
                          # file names, `/api/content-templates` routes, and the
                          # `content-templates` health component are all KEPT to
                          # avoid breaking frontend wiring): `PublishingContentTemplate`
                          # (eligible sources + keywords, OWN content filters
                          # on-read fail-open, reusable GLOBAL prompt-template
                          # ref, telegram/threads/both targets, own
                          # queue+matching+scheduling toggles, one-shot +
                          # recurring scheduling posts, DB bot bindings) +
                          # `TemplateBot` catalog (P23-like: AES-256-GCM via
                          # ENCRYPTION_KEY, redacted reads) + CRUD + bots
                          # controllers + health hook
   src/sessions/          # BUILT (todo 12, wired): `PublishingSession`
                          # (tab = session: template-loaded or ad-hoc,
                          # source toggles only, own keywords +
                          # matching/publishing/llm switches + own scheduling
                          # + N telegram/threads targets + active/inactive) +
                          # `SessionPublishPlanner` (SHARED global dedup probe
                          # once per message, P38 per-target pacing, unknown
                          # bots skip one target) + recording publisher +
                          # CRUD controller + health hook
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

All 10 feature modules WIRED (0 stubs). `IngestionModule`
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
  `TelegramQueuedArticleDispatcher` (LIVE Bot API binding since todo 7;
  the in-memory recorder remains as a test double only) +
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
- `SchedulingModule` (todo 6, wired): `ScheduledAd` +
  `SchedulingConfig`/`SchedulingState` (P38) + `RotationDeciderService` +
  `PublishScheduledAdUseCase` + `PublishScheduledAdNowUseCase` +
  media upload/clear/reuse + `SchedulingCronScheduler` +
  `SchedulingHealthState` + in-memory repos/dispatcher/storage +
  3 controllers + `SchedulingHealthIndicator` (P21 hook).
  `ScheduledAdDispatcherPort` is LIVE Telegram-backed since todo 7
  (text posts; the in-memory dispatcher remains as a test double only).
- `TelegramModule` (todo 7, wired — imports Llm via forwardRef): `TelegramPublisherPort` + crypto/threads Bot API adapters +
  `TelegramPublisherRouter` + per-bot rate limiters + LIVE
  `QueuedArticleDispatcherPort` / `ScheduledAdDispatcherPort`
  bindings (Queue/Scheduling rebind via forwardRef; their in-memory
  dispatchers remain as test doubles) + `TelegramHealthIndicator`
  (P21 hook).
- `ContentTemplatesModule` (todo 12, wired, lives in `src/template/`): `PublishingContentTemplate` +
  `TemplateBot` (P23-like catalog) + `TemplateEncryptionService` +
  template + bot use-cases + 2 controllers
  (`/api/content-templates`, `/api/content-template-bots`) +
  `ContentTemplatesHealthIndicator` (P21 hook). Exports repos +
  encryption for sessions.
- `SessionsModule` (todo 12, wired — imports ContentTemplates +
  Deduplication): `PublishingSession` + `PublishingSessionUseCases`
  (template-snapshot load) + `SessionPublishPlanner` (shared global
  dedup + P38 pacing) + `RecordingSessionPublisher` (live binding;
  Bot API binding follow-up) + `SessionsController`
  (`/api/sessions` CRUD + activate/deactivate + source toggles) +
  `SessionsHealthIndicator` (P21 hook).
  0 modules still stubs — all 12 feature modules wired.

* tolerant DTOs (`raw-feed-message.dto`, `feed-source.dto`)
* `IngestionHealthIndicator` (`{ component: 'ingestion', status }`,
  P21 hook point, provided + exported, unwired until composite health).
  SharedModule is `@Global()`
  (config namespaces + guard + filter + cache/event-bus ports in-memory +
  metrics + HTTP client).

## ENV INVENTORY

`.env.example` (40 vars): switches (`FEED_PUBLISHER_ENABLED`,
`USE_FEED_PUBLISHER`), port, `FEED_PUBLISHER_API_KEY` (inbound,
fail-open), `INGESTION_TELEGRAM_URL` + `INGESTION_TELEGRAM_API_KEY`
(outbound x-api-key, P30 day-one), `ENCRYPTION_KEY`, `DATABASE_URL` +
`DATABASE_SYNCHRONIZE`, `REDIS_URL`, 3-flag (`MATCHING_ENABLED`,
`LLM_ENABLED`, `PUBLISHING_ENABLED`, C-FLAGS-01) + `MATCHING_CRON_ENABLED`,
queue bounds (`QUEUE_TTL_HOURS=24`, `QUEUE_MAX_PENDING`), `DEDUP_ENABLED`,
LLM (`USE_MOCK_AI`, `OPENAI_API_KEY`, `LLM_MODEL`, `LLM_MAX_ATTEMPTS=3`),
ads (`ADS_ENABLED`, `ADS_ROTATION_EVERY_N` legacy + `SCHEDULING_*`
per-target `TELEGRAM|THREADS_{PUBLISH_DELAY_MS,DAILY_CAP}` (P38),
`SCHEDULING_CRON_ENABLED`, `SCHEDULING_MIN_MINUTES_BETWEEN_ADS`,
`FEED_PUBLISHER_UPLOADS_ROOT`), telegram
(`CRYPTO_NEWS_BOT_TOKEN`, `THREADS_BOT_TOKEN`,
`TELEGRAM_RATE_LIMIT_PER_MINUTE` shared default + optional
`CRYPTO_NEWS|THREADS_RATE_LIMIT_PER_MINUTE` per-bot overrides +
`CRYPTO_NEWS|THREADS_OUTPUT_CHANNEL` env channel defaults; explicit
chatId — e.g. DB-backed `LlmConfig.targetChannel` — always wins) +
bots-gateway client (todo 5: `BOTS_GATEWAY_URL` dev `:4070` /
staging `:4071` / prod `:4072`, `BOTS_GATEWAY_CLIENT_ID`,
`BOTS_GATEWAY_CLIENT_SECRET`, `FEED_PUBLISH_MODE=direct|dual|gateway`
default `dual`; read FLAT first — the `telegram` namespace is not
loaded by `AppModule`; migration needs an `admin`-scoped client).
Templates for staging (:3041) + prod
(:3042) next to the app. BotAPI = raw axios over Telegram Bot HTTP API
(same as backend adapter) — no extra dep.
Staging prep status (todo 10, prep only): `docker-compose.staging.yml` +
`.env.staging.template` landed DRY-RUN (host `:3041`, DB
`onchain_bot_feed_publisher_staging`); pending operator decision: staging
secrets (bot tokens, `INGESTION_TELEGRAM_API_KEY`, pg password) are filled
on the droplet and never committed.

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

## DECISIONS INDEX

| Decision                                | One-line                                                                                  | Status in this app                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| P10 strict type separation              | SSE subscribes ONLY to `messageType==='crypto-news'`                                      | ENFORCED (grep gate, NOTES)                              |
| P20 SSE-only + cursor catch-up (mirror) | No periodic polling; reconnect resumes from cursor                                        | APPLIED (todo 2)                                         |
| P21 health per component                | One indicator per module, P21 hook                                                        | APPLIED (10/10 wired, composite pending)                 |
| P30 Tramo-1 lessons                     | x-api-key day one, `dist/main.js`, env templates, lockfile                                | APPLIED (todo 1)                                         |
| P31 canonical ingestion names per env   | staging `:3033`, prod `:3032`, dev `:3031`                                                | REFERENCED (ports table)                                 |
| P32 zero foreign-type token             | No `'kol'` string outside the SSE negative assert                                         | ENFORCED (grep gate)                                     |
| P33 global templates vision             | `contentType`-scoped GLOBAL prompt catalog                                                | APPLIED (todo 5); full `src/template/` BC = todo 12 DONE |
| P34 sessions multi-tab vision           | `src/sessions/`, shared global dedup + templates                                          | APPLIED (todo 12 DONE)                                   |
| P36 ads -> scheduling rename            | Routes/tables/dirs `scheduling/*`, `feed_scheduled_*`                                     | APPLIED (todo 6)                                         |
| P38 per-target delay + daily cap        | `publishDelayMs` + `dailyCap` per telegram\|threads                                       | APPLIED (todo 6)                                         |
| P39 standing rule                       | AGENTS.md + CHANGELOG `## [Unreleased]` per todo                                          | APPLIED (this refresh)                                   |
| C-FLAGS-01 3-flag control               | `LLM = llm AND publishing`                                                                | APPLIED (todos 4/5)                                      |
| C-SSE-01 dual-path ingestion            | SSE filtered to feed + cursor catch-up                                                    | APPLIED (todo 2, polling dropped per P20)                |
| C-DB-01 own logical DB                  | `onchain_bot_feed_publisher[_staging]`                                                    | PLANNED (GAP-1, TypeORM unwired)                         |
| C-SHARED-01/C2 telegram move            | Crypto+threads adapters, second shared move                                               | APPLIED (todo 7)                                         |
| C1 threads un-stubbing contract         | `src/threads/CONTRACT.md`                                                                 | APPLIED (todo 8, v1 = 501 skeleton)                      |
| P50 auth anti-exploit                   | Global key (401) + ownership publish (403) + rate-limit + audit + secret-scan + drill     | APPLIED (todo 14)                                        |
| Gateway todo 5 dual-send                | `FEED_PUBLISH_MODE` direct\|dual\|gateway + HMAC client + parity ledger + vault migration | APPLIED (dual default, no cutover; blockers documented)  |

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
- Todo 6 (P25): scheduling stack ported reference read-only from
  backend `crypto-news-ads/` (rotation decider/cron/publish-now,
  upload/clear/reuse handlers, storage adapter, path builder, ads +
  rotation-config + media controllers, ads mapper); nothing outside
  `apps/feed-publisher/` touched (lockfile untouched — no new deps:
  `cron` + `@nestjs/swagger` + `FileInterceptor` resolve via hoisted
  root modules). P10/P32 grep gates green (verified empty incl.
  `src/scheduling/`). Failing-first: 2 core specs red on missing
  modules, then green; 18 suites / 72 tests for scheduling + full
  106/343 + `tsc` clean + `nest build` clean + boot smoke (health +
  rotation-config GET/PATCH per-target + ads POST/GET + library list).
  Deliberate deviations from the backend: (a) P36 rename ads ->
  scheduling everywhere (entities, routes `/api/scheduling/*`,
  tables `feed_scheduled_*`/`feed_ad_media_library`, dirs
  `uploads/ads/` + `uploads/ads-library/`); (b) P38 per-target
  `publishDelayMs` + `dailyCap` (telegram|threads) with independent
  waits + daily cutoffs (UTC dayKey, lazy rollover) — backend had one
  global `minMinutesBetweenAds`; (c) cap reached HELDS to next day
  (`heldUntilNextDay`, cursor untouched, no failure count — never
  silently dropped, spec-covered incl. next-day retry + sibling
  independence); (d) shared cadence `postsSinceLastAd` resets ONCE
  per cron tick when any target published (never inside the
  per-target publish, so telegram cannot starve threads mid-tick);
  (e) no Postgres advisory lock on the cron (single instance until
  GAP-3; overlap guard covers double ticks); (f) no slot
  arbitrator / random-delay throttle (todo 7 owns publisher
  pacing); (g) media sniffing is a local magic-byte helper (no
  cross-app helper import); (h) `publish-now` resets the cadence
  (manual posts count as the interleaved post) but skips failure
  bookkeeping. TypeORM shapes + mappers for all 5 scheduling tables
  ship UNWIRED (GAP-1) with in-memory adapters live. Backend
  `crypto-news-ads-library/` was empty per its AGENTS.md, so the
  uploads move is dir creation (`uploads/ads-library/.gitkeep`,
  gitignored like backend `uploads/`) — no bytes to migrate.
  Worktree left dirty (no commit).
- Todo 7 (P25): telegram crypto+threads adapters ported reference
  read-only from backend `crypto-news-publisher` senders
  (`bot-api-crypto-news-publisher.adapter` + `bot-api-http-client` +
  `build-multipart-body` + `guess-mime-type` + `telegram-file-utils`)
  - backend `TelegramPublisherPort` shape; nothing outside
    `apps/feed-publisher/` touched (lockfile untouched — no new deps:
    node:https transport, same as backend). P10/P32 grep gates
    literally empty in `src/telegram/` (rationale comments reworded +
    router negative assert uses `'sibling-type'` so the gate regexes
    stay clean). Failing-first: 8 new spec files red on missing
    modules, then green; 9 suites / 32 tests for telegram + full
    119/407 (8 failing suites are ALL `src/threads/` — parallel todo-8
    work-in-progress in this worktree: circular `ThreadsHealthState`
    import + missing thread entities; untouched here, todo 8 owns the
    fix) + `tsc` clean outside `src/threads/` (same 8 threads errors
    block `nest build`; telegram/queue/scheduling/shared are clean) +
    wiring specs as boot-equivalent (Telegram/Queue/Scheduling DI
    graphs compile with the new forwardRef edges). Deliberate
    deviations from the backend: (a) shared `BaseBotApiAdapter` holds
    the split/format/multipart logic; the two bots differ ONLY in
    identity (token/channel env names) + own limiter instance —
    backend had one crypto adapter; (b) per-bot rate budgets
    (`CRYPTO_NEWS|THREADS_RATE_LIMIT_PER_MINUTE` override the shared
    `TELEGRAM_RATE_LIMIT_PER_MINUTE`, fixed 60s window each — backend
    had no limiter); (c) tokens resolve lazily per call (backend read
    eagerly + warned) so dashboard-only boot never crashes; (d) chat
    resolution is `LlmConfig.targetChannel` (via `@Optional()` repo,
    fail-open to env) then `CRYPTO_NEWS|THREADS_OUTPUT_CHANNEL`
    (new envs); (e) missing token/channel returns ok:false with
    `not configured` + token name (never throws, never posts) — the
    drain releases to PENDING without burning an attempt and
    scheduling skips failure bookkeeping (both gates match on the
    token names); (f) scheduling ads publish TEXT-only in v1 (library
    media ids need the scheduling storage port — importing it would
    cycle the module graph; follow-up); (g) no HTML sanitizer port
    (backend `sanitizeTelegramHtml`/`formatUrlsAsMarkdown` not moved —
    captions post as-is; follow-up with the latin-validator pass).
    Worktree left dirty (no commit).
- Todo 8 (P25): threads skeleton + C1 contract ported reference
  read-only from spec §9 (builder/scheduler/use-cases/cron tree) +
  backend `ThreadsQueueEntry` lifecycle (statuses/transitions) +
  Tramo 1 `ThreadsStubController` 501 pinning (same
  `THREADS_NOT_IMPLEMENTED` code); nothing outside
  `apps/feed-publisher/` touched (lockfile untouched — no new deps:
  `cron` + `@nestjs/swagger` resolve via hoisted root modules).
  P10/P32 grep gates green (verified empty in `src/threads/`,
  incl. the `\bkol\b` token — cross-tramo refs say "template
  service (Tramo 1)" / "sibling"; the CONTRACT doc names the
  consumer explicitly as docs must). Failing-first: 13 new spec
  files red on missing modules (plus a self-import cycle in
  `threads-health.state.ts` and three `../`-depth slips, all caught
  red), then green; 14 suites / 54 tests for threads + full
  127/429 + `tsc` clean + `nest build` clean + boot smoke (health
  ok, 5/5 threads routes 501, queue stats unchanged). Deliberate
  deviations from the spec tree: (a) publish state machine folded
  into the `Thread` aggregate (no separate state file — transitions
  - `toPublishState` + snapshot/rehydrate live on the entity);
    (b) per-message delays pause the run as IN_PROGRESS awaiting the
    due time (no attempt burned) instead of a separate sequencing
    queue; (c) PARTIAL carries an optional `nextAttemptAt` so the
    backoff hold applies to partial retries too; (d) the v1
    controller pins 3 `@All()` handlers (root/:id/nested) instead of
    per-verb CRUD — same 501 coverage with less surface; (e) v2
    binds todo 7's exported `ThreadsBotApiAdapter` to
    `ThreadMessagePublisherPort` (one-line provider swap, use-case
    untouched). TypeORM shapes (`feed_threads`,
    `feed_thread_messages`, FK-less) + mapper ship UNWIRED (GAP-1)
    with in-memory adapters live. `THREADS_CRON_ENABLED` added to
    `.env.example` (defaults true, fail-open like the scheduling
    cron). Parallel-todo note: todo 7's AGENTS.md entry recorded
    this todo's red phase ("8 failing suites ... todo 8 owns the
    fix") — fixed here; its suites are green now. The mirror link
    from `apps/kol-system/AGENTS.md` to `src/threads/CONTRACT.md`
    is pending (this todo is read-only outside
    `apps/feed-publisher/` by constraint). Worktree left dirty
    (no commit).
- Todo 12 (P25): content-templates + sessions BCs built from the
  sibling-service template pattern + v3 `PublishingProfile` design
  (research `.omo/evidence/content-templates-research.md`), nothing
  outside `apps/feed-publisher/` touched (lockfile untouched — no new
  deps). P10/P32 grep gates green (verified empty incl. both new
  BCs). Failing-first: 2 entity specs red on missing modules, then
  green; 16 suites / 31 tests new + full 143/460 + `tsc` clean +
  `nest build` clean + boot smoke (`:3099` health ok, empty lists on
  all 3 new controllers). Deliberate decisions: (a) P23-like bot
  catalog is a NEW table owned by this BC (`TemplateBot`,
  ciphertext-only, redacted reads) — feed-publisher has no bots table
  to reuse and importing the sibling catalog would cycle the module
  graph; (b) prompt templates stay GLOBAL (reusable ref, never copied
  into templates/sessions); (c) dedup stays GLOBAL and shared (one
  probe per message blocks ALL sessions); (d) P38 pacing is per
  (session, target) with session overrides falling back to injected
  global limits — delay/cap HOLD, never drop; (e) template edits do
  NOT rewrite live sessions (creation-time snapshot); (f) the
  publisher binding is the in-memory recorder (Bot API binding is a
  follow-up resolving catalog tokens per call, same shape as todo 7);
  (g) TypeORM shapes deferred (GAP-1, one unwired orm-entity stub).
  Adversarial: inactive sessions consume/publish nothing
  (spec-pinned, incl. the multi-tab integration). Worktree left dirty
  (no commit).
- Todo 14 (P25 + P50): auth anti-exploit, nothing outside
  `apps/feed-publisher/` touched except the mandated evidence log
  (lockfile untouched — no new deps: `supertest` was already a dep).
  P10/P32 grep gates green (verified empty incl. the new publish
  path). Failing-first: 7 new spec files red on missing modules (5
  missing-module + 2 metadata), then green; 7 suites / 23 tests new
  - full 150/483 + `tsc` clean + `nest build` clean + live curl
    matrix (`:3099`: health 200 keyless, guarded 401s, publish
    201/403/404/429). Deliberate decisions: (a) `ApiKeyGuard` throws
    401 instead of returning false, so scanners see 401 on bad keys
    and 403 stays reserved for ownership violations (existing guard
    spec updated to the throw contract); (b) global guard + filter via
    `APP_GUARD`/`APP_FILTER` in `AppModule` (no `main.ts` change —
    every present AND future controller is covered, only `@Public()`
    health skips); (c) unknown bot ids read as FORBIDDEN, never
    NOT_FOUND (no catalog-existence leak); (d) ownership =
    session-owned binding + same-target bot + `adminVerifiedAt` set +
    `chatId === defaultChatId` (the verified channel — hijacked chats
    403 even when the binding names them); (e) the cron planner skips
    violators silently (fail-safe) while the explicit path throws +
    audits (loud); (f) audit entries are routing facts only
    (spec-pinned key allowlist, no token/ciphertext fields exist);
    (g) old planner/integration fixtures upgraded to verified bots
    with matching channels (the new invariant, not a behavior carve).
    Adversarial: exploit simulation matrix spec-pinned at unit + HTTP
    level (cross-session reuse, unverified bot, target mismatch,
    channel hijack, rate flood). Worktree left dirty (no commit).

## STANDING RULE

Update this file on every todo (program index + program status +
gaps + decisions) plus a `CHANGELOG.md` `## [Unreleased]` entry in
English per `RELEASE-FLOW.md` (P39). Stale knowledge base = failed todo.

## NOTES

- P10 enforced by grep gate: `grep -rn "vip-calls\|KOL_BOT\|kol-bot" apps/feed-publisher/src` must stay empty.
- P41 dual-serve contract (T2 todo 13, backend-side): the backend dual-serves old+new until
  cutover todo 11; this app already serves `feed-*` names and becomes sole owner of
  `feed-publisher/*`, `feed-scheduling/*`, `feed-threads-publisher/*`, `feed-matching/*`,
  `feed-filters/*` at cutover. No code change here in todo 13.
- Bot tokens OPTIONAL at boot (dashboard-only mode); adapters fail with a
  clear error when absent (todo 7).
- Gateway todo 5 (dual-send): `FEED_PUBLISH_MODE` defaults to `dual`
  (parity runs, direct leg returned); `gateway` is cutover rehearsal
  only until gateway todo 7 covers local-file/video/button shapes +
  persists the vault mapping. Divergence → no cutover
  (`assertNoDivergence` CONFLICT). Backend legacy feed senders untouched
  (deprecate at todo 7).
