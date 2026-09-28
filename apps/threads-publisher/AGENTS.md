# apps/threads-publisher/ — NestJS Knowledge Base

> Verified 2026-09-27 against code + `.omo/evidence/task-9-threads-publisher.log`
> (12 suites / 41 tests green, tsc + nest build clean, live boot `:4100`
> 5-up). v0.1.0 (source of truth: `package.json`; threads-publisher
> Fase 2 todo 9 DONE, todos 10-11 pending).
> Decisions cited as Pxx come from `.omo/drafts/mega-refactor-tramos.md`
> §7.6. Contracts pinned in `.omo/plans/mega-refactor-central.md`
> v2026-09-26. Source plan: `.omo/plans/threads-publisher.md` Fase 2.

Contents: OVERVIEW · PROGRAM STATUS · COMMANDS · STRUCTURE · MODULES ·
ENV INVENTORY · PORTS · HEALTH · TS/ESLINT CONVENTIONS · TESTS · GAPS ·
DECISIONS

## OVERVIEW

NestJS 11 service owning all Threads publishing outside the monolith:
Meta Threads publisher (queue + keywords + blacklist + LLM + matching +
cron + token refresher, backend `src/threads/` parity) + feed thread
skeleton (feed-publisher `src/threads/` v2 owner: Thread aggregate +
builder-equivalent use-cases + in-memory CRUD) + gateway dual-run
transport (vault botId only, never tokens).

Built COPY-first from backend `src/threads/` + feed-publisher
`src/threads/` (read-only source; no `git mv` in this todo — history
moves at cutover todo 11). No behavior change except: the drain binds
the DIRECT adapter locally while `DualThreadsPublisher` runs parity
beside it (default `dual`), and the media root / DB names are this
app's own.

Design pivots:

- **C-FLAGS-01 — 3-flag control**: matching / llm / publishing are
  independent; LLM generation runs ONLY when llm AND publishing are on.
- **Dual-run by default**: `THREADS_PUBLISH_MODE=direct|dual|gateway`
  (default `dual`) — direct leg returned, gateway leg compared
  outcome-only; `assertNoDivergence()` is the cutover gate (todo 11).
- **Gateway-first tokens**: `THREADS_ACCESS_TOKEN`/`THREADS_USER_ID`
  stay in env + `threads_oauth_tokens` (id=1); the gateway only ever
  sees vault `THREADS_GATEWAY_BOT_ID` (HMAC-signed, DISTINCT per env).
- **C-DB-01 — own logical DB**: `onchain_bot_threads[_staging]` on the
  same server as the backend DB per env.
- **Cutover flag**: `USE_THREADS_PUBLISHER=false` (backend legacy serves
  traffic until todo 11 flips dev -> staging -> prod).

## PROGRAM STATUS

Todo 9 DONE (verified 2026-09-27 against code + evidence log):

- Wired modules: Threads (Meta publisher) + FeedThreads (v2 thread
  owner) + Telegram (gateway dual-run) + Health (composite, 5
  components). 0 stubs remain.
- Full-suite tally: 12 suites / 41 tests green. Coverage 71% stmts
  (target >80% — GAP-1: controllers + adapter error legs).
- Live boot matrix (`:4100`): health 5-up, queue counts
  `{"pending":0,...}`, threads list `[]`, guarded 401s (ApiKeyGuard).
- Ports verified free repo-wide: `lsof -i :4100-4102` empty pre-boot;
  dev `:4100` boot + curl in evidence.

Todos 10-11 PENDING (not started, no evidence):

- 10 `target/` substitution (sustituye dirs `telegram/`+`threads/`);
  11 cutover + cleanup + CI/deploy staging/prod (`USE_THREADS_PUBLISHER`).

Worktree state 2026-09-27: DIRTY (new `apps/threads-publisher/` tree
untracked; backend/feed-publisher origins untouched — deprecate at
cutover todo 11). No commit per dirty-worktree constraint.

## COMMANDS

```bash
npm test -w @onchain-bot/threads-publisher      # jest, all specs
npm run build -w @onchain-bot/threads-publisher # nest build -> dist/main.js
curl -s localhost:4100/api/health               # {"status":"ok",...}
docker compose -f apps/threads-publisher/docker-compose.yml up -d  # standalone pg :5446 + redis :6393 (centralized dev uses single pg :5432, see docker-compose.dev.yml)
```

From repo root (root `package.json` untouched — run via `-w`).

## STRUCTURE

```
apps/threads-publisher/
  src/main.ts            # bootstrap :4100 (THREADS_PUBLISHER_PORT) + ValidationPipe + Tier-1 check
  src/app.module.ts      # Config global + Health + Threads + FeedThreads + Telegram + guard + filter
  src/health/            # GET /api/health composite (5 components, @Public keyless)
  src/threads/           # Meta publisher (backend parity): queue entry (6-state) +
                         # keywords/blacklist/matching evaluator + llm config (SIN target) +
                         # prompt template (threads-default pinned) + throttle (60s-300s) +
                         # matching config (1 row) + oauth token (id=1) + enqueue/drain
                         # use-cases + cron (every-10-min, lock 7_421_372) + token
                         # refresher (daily) + direct Meta adapter (truncate 500,
                         # media_skipped, FAKE refuse) + 5 controllers (dual-serve
                         # threads-publisher/* + feed-threads-publisher/*)
  src/feed-threads/      # Feed thread skeleton v2 (feed-publisher parity):
                         # FeedThread (DRAFT->QUEUED->IN_PROGRESS->COMPLETED,
                         # PARTIAL resume, FAILED terminal) + in-memory CRUD
                         # (POST/GET/GET :id/POST :id/enqueue) + health hook
  src/telegram/          # Gateway dual-run: HMAC signer + send client (vault
                         # botId only) + publish-mode (default dual) +
                         # DualThreadsPublisher (outcome ledger + CONFLICT gate)
  src/shared/            # config (Tier-1 DATABASE_URL) + api-key guard/filter/security/decorators + kernel
  Dockerfile             # EXPOSE 4100, CMD dist/main.js
  docker-compose.yml     # standalone pg :5446 + redis :6393 (centralized dev: single pg :5432)
  docker-compose.staging.yml  # host :4101, pg :5447, redis :6394 (LIVE staging since 2026-09-27: app service added, onchain-bot-staging-net)
  .env.example / .env.staging.template / .env.production.template
```

## MODULES

- `ThreadsModule` (moved-copy, rewired): `ThreadsQueueRepository`
  bound to `InMemoryThreadsQueueRepository` (cap 100, oldest-first
  eviction); `ThreadsApiPublisherPort` bound to the DIRECT adapter
  locally (drain path); `DualThreadsPublisher` lives in TelegramModule
  for parity runs. Cron + refresher auto-registered.
- `FeedThreadsModule` (new owner): in-memory thread store (TypeORM
  shapes deferred GAP-1).
- `TelegramModule` (new): `GatewaySendClient` + `DualThreadsPublisher`
  (direct returned, gateway compared; `gateway` mode fail-closed).
- `HealthModule`: imports the three feature modules so their P21
  indicators resolve in scope (all `@Optional`).

## ENV INVENTORY

`.env.example` (30+ vars): switches (`THREADS_PUBLISHER_ENABLED`,
`USE_THREADS_PUBLISHER`), port, `THREADS_PUBLISHER_API_KEY` (inbound,
fail-open), `INGESTION_TELEGRAM_URL` + `INGESTION_TELEGRAM_API_KEY`
(outbound x-api-key, P30 day-one), `ENCRYPTION_KEY`, `DATABASE_URL` +
`DATABASE_SYNCHRONIZE`, `REDIS_URL`, 3-flag (`MATCHING_ENABLED`,
`LLM_ENABLED`, `PUBLISHING_ENABLED`) + queue bounds
(`QUEUE_TTL_HOURS=24`, `THREADS_MAX_QUEUE_DEPTH=100`) + publisher
cadence (`THREADS_PUBLISH_CRON` every-10-min, `THREADS_DAILY_CAP=60`)

- Meta (`THREADS_USER_ID`, `THREADS_ACCESS_TOKEN`, NEVER committed)
- gateway client (`BOTS_GATEWAY_URL` dev `:4070` / staging `:4071` /
  prod `:4072`, `BOTS_GATEWAY_CLIENT_ID`, `BOTS_GATEWAY_CLIENT_SECRET`,
  `THREADS_PUBLISH_MODE=direct|dual|gateway` default `dual`,
  `THREADS_GATEWAY_BOT_ID`, DISTINCT per env).
  Templates for staging (`:4101`, DB `onchain_bot_threads_staging`) +
  prod (`:4102`, DB `onchain_bot_threads`).

## PORTS

| Env     | App   | Postgres          | Redis         |
| ------- | ----- | ----------------- | ------------- |
| dev     | :4100 | :5432 (single pg) | :6393         |
| staging | :4101 | :5447\*           | :6394\*       |
| prod    | :4102 | server-shared     | server-shared |

\* LIVE staging since 2026-09-27 (staging backport added the app
service). No clashes with backend
(`:3030`), ingestion (`:3031/32/33`), frontend (`:5173`),
feed-publisher (`:3040/41/42`), kol-stacks, market-data, dexter,
gateway (`:4070/71/72`), scheduling-posts (`:4080/81/82`).

## HEALTH

`GET /api/health` → `{ status: 'ok', components }` with
`threads-publisher`, `database` (in-memory until the persistence
todo), `threads`, `feed-threads`, `telegram` (via their P21
indicators). Shape backward compatible (`status: 'ok'`).

## TS/ESLINT CONVENTIONS

Mirrors feed-publisher: `singleQuote`, strictNullChecks/noImplicitAny,
`emitDecoratorMetadata` + `experimentalDecorators`, path aliases
`@/*` (= `src/*`, for 2+-level imports; 2026-09-27 migration),
`shared/*`, `threads/*`, `feed-threads/*`, `telegram/*`, `health/*`,
`src/*`.

## TESTS

Jest (`testRegex: .*\.spec\.ts$`, `--forceExit --runInBand`).
Failing-first: scaffold baseline red (no inputs in tsconfig + missing
HealthController), then green. Coverage 71% stmts (target >80%).

## GAPS

1. Persistence wiring (TypeORM `threads_*` + `feed_threads`,
   `synchronize:false` outside dev) — in-memory adapters live.
2. SSE ingestion client + cursor catch-up (backend FilteredThreadsService
   parity over HTTP) — evaluator + enqueue live, fetch deferred.
3. `git mv` history move + backend/feed-publisher deprecate headers
   (todo 11 cutover owns the rewrite).
4. Deploy workflows (staging/prod) + rollback rehearsal (todo 11).
5. Coverage to >80% (adapter error legs + controllers).
6. No eslint flat config in this app (same as siblings — lint script
   resolves via root).

## DECISIONS

- COPY-first (not `git mv`) in todo 9: origins untouched (read-only
  outside `apps/threads-publisher/` by constraint); history moves at
  cutover todo 11 with dual-run + deprecate headers.
- Direct adapters live (not yet `@deprecated`): drain binds direct
  until parity evidence lands; deprecate at todo 11.
- Root `package.json` untouched (no `dev:threads-publisher` alias —
  run via `-w @onchain-bot/threads-publisher`). Lockfile untouched
  (no new deps).
- `gateway` mode is fail-closed (no bot id = FAILED, never direct
  fallback); `dual` without bot id records `skipped` (serving never
  breaks).
- Backend legacy threads modules already carry `@deprecated` headers
  pointing at feed-publisher (their cutover is todo 11 here).
