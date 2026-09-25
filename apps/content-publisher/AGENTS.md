# apps/content-publisher/ — NestJS Knowledge Base

> Verified 2026-09-25 against code. v0.1.0 (source of truth: `package.json`; Tramo 2 scaffold, todo 1).
> Decisions cited as Pxx come from `.omo/drafts/mega-refactor-tramos.md` §7.6 (2026-09-24).
> Cross-tramo contracts pinned in `.omo/plans/mega-refactor-central.md` v2026-09-24;
> content-publisher plan in `.omo/plans/mega-refactor-content-publisher.md` (12 todos).
> Spec base: `.kiro/specs/refactor-content-publisher/` (11-refactor 3437 lines).

Contents: OVERVIEW · PROGRAM INDEX · COMMANDS · STRUCTURE · MODULES · ENV INVENTORY · PORTS · HEALTH ·
TS/ESLINT CONVENTIONS · TESTS · GAPS · DECISIONS · STANDING RULE · NOTES

## OVERVIEW

NestJS 11 service (Tramo 2 of the mega-refactor) that will own all crypto-news
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
- **C-SSE-01 — dual-path ingestion**: SSE filtered to crypto-news +
  polling fallback, `x-api-key` (`INGESTION_TELEGRAM_API_KEY`) from day one.
- **C-DB-01 — own logical DB**: `onchain_bot_content_publisher[_staging]`
  on the same server as the backend DB per env.
- **C2 — second shared move**: telegram crypto+threads adapters are the
  second C-SHARED-01 move (first was kol-system KOL-bot, todo 11).
- **Threads v1 = skeleton + C1 contract** (todo 8): same 501s Tramo 1 fixed,
  never implemented here.

## PROGRAM INDEX

| Todo | Status                                                           | What                                                                                                            |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 0    | DONE (evidence `.omo/evidence/task-T2-01-content-publisher.log`) | Precondition Gate T1: 9/9 backend `@deprecated` headers + T1 suites signal + `telegram/shared` clean of KOL-bot |
| 1    | DONE (this scaffold)                                             | App setup + shared transversal, green                                                                           |
| 2    | DONE (evidence `.omo/evidence/task-T2-02.log`)                   | Ingestion crypto-news HTTP+SSE (SSE-only, catch-up by cursor, x-api-key day one)                                |
| 3    | TODO                                                             | Matching + keywords + filters                                                                                   |
| 4    | TODO                                                             | Queue unificada + deduplication                                                                                 |
| 5    | TODO                                                             | LLM config+templates+core+playground                                                                            |
| 6    | TODO                                                             | Scheduling/ads + media library                                                                                  |
| 7    | TODO                                                             | Telegram crypto+threads adapters (C2)                                                                           |
| 8    | TODO                                                             | Threads esqueleto + contrato C1                                                                                 |
| 9    | TODO                                                             | Frontend 4 endpoints + flags UI                                                                                 |
| 10   | TODO                                                             | Staging 7d + rollback rehearsal                                                                                 |
| 11   | TODO                                                             | Cutover + cleanup (`USE_CONTENT_PUBLISHER`)                                                                     |

## COMMANDS

```bash
npm run dev -w @onchain-bot/content-publisher   # watch, :3040
npm test -w @onchain-bot/content-publisher      # jest, all specs
npm run build -w @onchain-bot/content-publisher # nest build -> dist/main.js
curl -s localhost:3040/api/health               # {"status":"ok"}
docker compose -f apps/content-publisher/docker-compose.yml up -d  # pg :5436 + redis :6383
```

## STRUCTURE

```
apps/content-publisher/
  src/main.ts            # bootstrap :3040 (CONTENT_PUBLISHER_PORT) + ValidationPipe
  src/app.module.ts      # Config global + Health + 10 stub modules
  src/health/            # GET /api/health static stub
  src/ingestion/         # BUILT (todo 2, wired): CryptoNewsIngestionClient
                         # (SSE-only + catch-up by cursor, backoff 1s→30s) +
                         # ProcessCryptoNewsMessageHandler (seen-key dedup) +
                         # IngestionHttpClientAdapter (?type=crypto-news, x-api-key)
                         # + DTOs + port + IngestionHealthIndicator (P21 hook)
  src/matching/          # STUB (todo 3)
  src/keywords/          # STUB (todo 3)
  src/filters/           # STUB (todo 3)
  src/queue/             # STUB (todo 4)
  src/deduplication/     # STUB (todo 4)
  src/llm/               # STUB (todo 5)
  src/scheduling/        # STUB (todo 6)
  src/threads/           # STUB (todo 8, v1 skeleton only)
  src/telegram/          # STUB (todo 7, crypto+threads)
  src/shared/            # transversal (DONE, tested)
    config/              # app + database + redis + telegram namespaces
    kernel/              # AggregateRoot/Entity/ValueObject/DomainEvent/DomainError
    value-objects/       # ContentTypeVo (crypto-news|threads), ContentId
    events/              # content-publisher.queue.queued / telegram.published|failed
    exceptions/          # QueueFull/LlmFailed/PublishFailed errors
    typeorm/             # TypeOrmBase + SnakeCaseNamingStrategy
    http/                # SharedHttpClient (axios) + RetryPolicy (bounded backoff)
    cache/               # CachePort + InMemoryCacheAdapter (Redis later)
    messaging/           # EventBusPort + InMemoryEventBusAdapter
    monitoring/          # MetricsService (counters/gauges, Prometheus-shape)
    security/            # x-api-key helpers (fail-open when empty)
    decorators/          # @Public()
    filters/             # DomainExceptionFilter (DomainError -> HTTP)
    guards/              # ApiKeyGuard (CONTENT_PUBLISHER_API_KEY)
```

## MODULES

9 feature modules remain `@Module({})` stubs with a `*.module.spec.ts`
compile test pointing at the todo that fills them. `IngestionModule`
(todo 2, wired): `CryptoNewsIngestionClient` (SSE-only crypto-news
client — accepts ONLY `data.messageType==='crypto-news'`, foreign type
rejected by negative assert, P10; reconnect catch-up by cursor, NO
periodic polling; backoff 1s doubling → 30s cap; `x-api-key` on SSE
from day one, P30) + `ProcessCryptoNewsMessageHandler` (one frame at a
time, `channelId:messageId` seen-key = double-delivery guard) +
`IngestionHttpClientAdapter` (`CryptoNewsIngestionClientPort` impl:
`GET /api/feed/sources?type=crypto-news` + `/api/feed/messages?type=…`,
base `INGESTION_TELEGRAM_URL`, `x-api-key` from day one, fail-open `[]`)

- tolerant DTOs (`raw-crypto-news-message.dto`, `crypto-news-source.dto`)
- `IngestionHealthIndicator` (`{ component: 'ingestion', status }`,
  P21 hook point, provided + exported, unwired until composite health).
  SharedModule is `@Global()`
  (config namespaces + guard + filter + cache/event-bus ports in-memory +
  metrics + HTTP client).

## ENV INVENTORY

`.env.example` (27 vars): switches (`CONTENT_PUBLISHER_ENABLED`,
`USE_CONTENT_PUBLISHER`), port, `CONTENT_PUBLISHER_API_KEY` (inbound,
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
5. Frontend sub-table + `VITE_CONTENT_PUBLISHER_URL` (todo 9).
6. Deploy workflows (staging/prod) + rollback rehearsal (todo 10).

## DECISIONS

- P30 applied: `INGESTION_TELEGRAM_API_KEY` in `.env.example` day one;
  Dockerfile CMD `dist/main.js`; app-level `npm run dev`; lockfile synced;
  this AGENTS.md created viva from todo 1.
- Root `package.json` untouched (no `dev:content-publisher` alias — same as
  kol-system; run via `-w @onchain-bot/content-publisher`). Kept read-only
  outside `apps/content-publisher/` except the mandated lockfile sync.
- Deps mirror backend versions (axios ^1.18.0, ioredis ^5.4.1, openai
  ^6.45.0) + BullMQ ^5.12.0 (queue backend, wired in todo 4).
- P32 applied (todo 2): zero foreign-type token in new ingestion code —
  the single `'kol'` string in `src/` lives in the SSE negative assert
  (`crypto-news-ingestion-client.service.spec.ts:35`); `api-key.ts`
  comment reworded to "sibling extraction service". Pre-existing P10
  rationale comments elsewhere still name the foreign type as
  documentation (out of scope for this todo).

## STANDING RULE

Update this file on every todo (program index + gaps + decisions). Stale
knowledge base = failed todo.

## NOTES

- P10 enforced by grep gate: `grep -rn "vip-calls\|KOL_BOT\|kol-bot" apps/content-publisher/src` must stay empty.
- Bot tokens OPTIONAL at boot (dashboard-only mode); adapters fail with a
  clear error when absent (todo 7).
