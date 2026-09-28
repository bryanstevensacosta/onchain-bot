# apps/market-data/ — NestJS Knowledge Base

> Verified 2026-09-28 against code + `.omo/evidence/marketdata-restructure.log`
> (final restructure: address/chain, aggregators/, provider
> quote-fetchers, snapshot history-only, shared/infra cache+limiter)
> — prior tallies in `.omo/evidence/task-T3-04.log`
> (todo 4 + P47) + `.omo/evidence/task-12-mega-refactor-market-data.log`
> (todo 12, P50) + `.omo/evidence/task-11-mega-refactor-market-data.log`
> (todo 11, P49) + `.omo/evidence/task-T3-address.log`
> (P45) + `.omo/evidence/task-T3-02.log`.
> v0.1.0 (source of truth: `package.json`; Tramo 3, todos 0-2 + 4-5 + 10-12 DONE,
> P45 address model DONE, P47 provider-home relocation DONE, P50 global
> hexagonal + snapshot module DONE, P49 streaming DONE, todo-3 aggregators pending).
> Decisions cited as Pxx come from `.omo/drafts/mega-refactor-tramos.md`
> §7.6 (2026-09-24, P30 2026-09-25).
> Cross-tramo contracts pinned in `.omo/plans/mega-refactor-central.md`
> v2026-09-24; market-data plan in
> `.omo/plans/mega-refactor-market-data.md` (10 todos: 0-9).
> Spec base: `.kiro/specs/refactor-data/` (read as REQUIREMENTS, not
> topology: v1 topology is this app's `src/*`, G-16).

Contents: OVERVIEW · PROGRAM INDEX · PROGRAM STATUS · COMMANDS ·
STRUCTURE · MODULES · ENV INVENTORY · PORTS · HEALTH · SECURITY ·
TS/ESLINT CONVENTIONS · TESTS · GAPS · DECISIONS INDEX · DECISIONS ·
STANDING RULE · NOTES

## OVERVIEW

NestJS 11 service (Tramo 3 of the mega-refactor) owning all market data
outside the monolith: chain catalog + probers → provider registry →
aggregators (price/holders/security) → token snapshots over HTTP with
a measured p95<500ms SLO, plus the final-phase `dexter-onchain-bot`
sibling (P13, todo 9). Todos 0-2 DONE (gate + setup + chain/provider/
cache/rate-limiter + gateway shell); todos 3-9 pending.
See PROGRAM STATUS for the verified tally.

Design pivots that govern every future todo:

- **Variante A v1 (G-16)** — single-BC monorepo app. Every `libs/*`
  path in the spec maps to `src/*` here (providers →
  `token/infrastructure/providers`, aggregators →
  `token/application/services`, cache/rate-limiter → own modules,
  shared-kernel → `shared/`). Variante B (split apps / Nx) is a later
  phase gated on consumer count or p95 — never invented mid-todo.
- **C-DATA-01 order** — providers move LAST (todo 4), after Tramos 1-2
  consume enrichment via ports with flag. No early moves.
- **G-17 SLO gate** — `USE_DATA_SERVICE_API=true` becomes default only
  with a measured p95<500ms (todo 5). No cutover on promises.
- **C-DB-01 — own logical DB**: `onchain_bot_market_data[_staging]`
  on the same server as the backend DB per env.
- **P30 Tramo-1 lessons** — x-api-key day one, `dist/main.js`, app-level
  `npm run dev`, env templates staging+prod from setup, AGENTS.md vivo.

## PROGRAM INDEX

> Evidence filenames below are the REAL names on disk
> (`.omo/evidence/task-0-mega-refactor-market-data.log` for todo 0,
> `.omo/evidence/task-T3-01.log` for todo 1).

| Todo | Status                                                                | What                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | DONE (evidence `.omo/evidence/task-0-mega-refactor-market-data.log`)  | Precondition Gate T2: 6/6 backend `Moved to apps/feed-publisher` areas verified                                                                                                                                                                                                                                                                                                                                                          |
| 1    | DONE (evidence `.omo/evidence/task-T3-01.log`)                        | App setup + shared kernel (10 suites / 17 tests; boot smoke `:4000`)                                                                                                                                                                                                                                                                                                                                                                     |
| 2    | DONE (evidence `.omo/evidence/task-T3-02.log`)                        | Modules chain + provider + cache + rate-limiter + gateway shell (P43)                                                                                                                                                                                                                                                                                                                                                                    |
| P45  | DONE (evidence `.omo/evidence/task-T3-address.log`)                   | Address model absorbs token: `src/address/` + `/api/v1/addresses/*` (token = kind=token path; `/tokens/*` deprecated alias)                                                                                                                                                                                                                                                                                                              |
| 3    | TODO (model DONE via P45)                                             | Aggregators + persistence for address snapshots + HTTP batch                                                                                                                                                                                                                                                                                                                                                                             |
| 4    | DONE (evidence `.omo/evidence/task-T3-04.log`)                        | Physical provider extraction + Dexter-integrated (C-DATA-01, last move): 13 adapters canonical in `src/provider/infrastructure/`, registry 13/13, backend on shims                                                                                                                                                                                                                                                                       |
| P47  | DONE (evidence `.omo/evidence/task-T3-04.log`)                        | Provider-home relocation: `address/infrastructure/providers/*` → `provider/infrastructure/<name>/` (single-level, P43-aligned)                                                                                                                                                                                                                                                                                                           |
| 5    | DONE (evidence `.omo/evidence/task-5-mega-refactor-market-data.log`)  | HTTP bridge + SLO + staged flag (G-17): compat `GET /api/market-data/snapshot` + `POST /api/v1/addresses/batch` (50-cap) + warm-burst p95 0.96ms < 500ms PASS; kol-system dev flipped, backend leaf default-false                                                                                                                                                                                                                        |
| 10   | DONE (evidence `.omo/evidence/task-10-mega-refactor-market-data.log`) | Scoped API-key auth (P46 seguridad): `src/auth/` (hash-only store, read/snapshot/admin, dual-key rotation, per-key limit, audit, loopback bind, compromise drill)                                                                                                                                                                                                                                                                        |
| 11   | DONE (evidence `.omo/evidence/task-11-mega-refactor-market-data.log`) | Streaming ccxt on-demand vía ws (P49): `src/stream/` (single-conn-per-exchange manager + broker: P46 auth, shared REST rate budget, backpressure, disconnect cleanup) + Socket.IO `gateway/infrastructure/ws` (`/market-data`); 43/149 green, live `:4133` 100 subs + REST p95 intact                                                                                                                                                    |
| 12   | DONE (evidence `.omo/evidence/task-12-mega-refactor-market-data.log`) | Hexagonal global + legacy deprecated (P50): every module in domain/ + application/ + infrastructure/ + new `SnapshotModule`; all legacy roots are `@deprecated` compat re-exports; 32 suites / 109 tests identical, routes identical                                                                                                                                                                                                     |
| 16   | DONE (evidence `.omo/evidence/task-16-mega-refactor-market-data.log`) | ccxt-first cascade + limiter-config per provider (P48-bis): `src/provider/infrastructure/ccxt/` REST adapter (14th, tickers/OHLCV CEX, optional peer, allowlist `MARKET_DATA_CCXT_EXCHANGES`); fetchers ccxt-first where covered (`covers()`), merge untouched; full limiter config via ports (window/quota/endpoint-cost/backoff), cost-aware fail-open gate; 61/232 green, live `:4146`                                                |
| logo | DONE (evidence `.omo/evidence/chain-logo.log`)                        | Permanent chain-logo resolver: `src/chain-logo/` (fetch-ONCE TrustWallet primary + CoinGecko fallback + placeholder, `uploads/chain-logo/<chain>.png`) + gateway `GET /api/v1/chains/:id/logo` (public, long cache) + `POST /api/v1/chains/:id/logo/refresh` (admin); `ChainInfo.logoUrl` per chain                                                                                                                                      |
| R1   | DONE (evidence `.omo/evidence/marketdata-restructure.log`)            | Final `src/` restructure (no behavior change): chain → `address/chain/` (catalog+probers) + NEW `aggregators/` (merge + failover data + `AggregationPolicyPort` with ccxt-first/quota-aware default) + fetchers → `provider/infrastructure/quote-fetchers/` + snapshot history-only + cache/rate-limiter → `shared/infrastructure/` + holders via `DevHoldingsPort`; 62/238 green, `tsc` + `nest build` clean, live route-diff identical |
| 6    | TODO                                                                  | Legacy market-data rename + frontend migration (R-4, G-18)                                                                                                                                                                                                                                                                                                                                                                               |
| 7    | TODO                                                                  | Frontend: data dashboard + Dexter (C-UX-01)                                                                                                                                                                                                                                                                                                                                                                                              |
| 8    | TODO                                                                  | Staging 7d + cutover + cleanup Tramo 3                                                                                                                                                                                                                                                                                                                                                                                                   |
| 9    | TODO                                                                  | dexter-onchain-bot app: extraction + cutover (P13, final phase)                                                                                                                                                                                                                                                                                                                                                                          |

## PROGRAM STATUS

Todos 0-2 + 4-5 + 10-12 + 16 + R1 DONE (verified 2026-09-28 against code + evidence logs):

- Wired modules: health (live `GET /api/health`, `@Public()`) + shared
  (global, transversal + `infrastructure/cache` + `infrastructure/rate-limiter`
  since R1) + address (P45 universal model; chain catalog+probers live
  at `address/chain/` since R1) + aggregators (R1: `AggregationPolicyPort`
  - default policy + merge + failover data) + snapshot (R1: history
    persistence + thin pipeline orchestrator only) + token (deprecated P45
    alias) + chain/cache/rate-limiter (compat re-export shims since R1;
    canonical homes under address//shared/) + `ProvidersModule`
    (todos 4+16: the 14 canonical adapters + `quote-fetchers/` since R1)
  - gateway (P43: the ONLY feature controllers, hexagonal since todo 12;
    todo 11 adds the WS transport `MarketDataWsGateway`, namespace
    `/market-data`) + stream (todo 11, P49: `ExchangeConnectionManager` +
    `StreamBrokerService` + in-memory/ccxt adapters +
    `DefaultExchangeAdapterFactory`) + holders (via `DevHoldingsPort`
    since R1) + auth + chain-logo (all unchanged by R1).
- Suite tally: 62 suites / 238 tests green (R1: +1 suite / +6 tests for
  the NEW `AggregationPolicyPort` default spec, failing-first red→green;
  all 61 pre-existing suites byte-identical counts — no behavior
  change). Pre-R1 baseline was 61/232.
- Suite tally: 64 suites / 248 tests green (+1 suite / +6 tests for
  the coverage-expand `solana-rpc` quote fetcher, failing-first
  red→green; pre-expand baseline 63/242 per
  `.omo/evidence/zero-cost-probe.log`).
- Suite tally: 61 suites / 232 tests green (+4 suites / +21 tests for
  todo 16, P48-bis: limiter-config, ccxt REST, cascade order,
  quota-cost + adversarial breach; barrel + registry + outbound
  specs updated 13 -> 14; pre-todo-16 baseline was 57/211).
- Todo 11 (P49) added +5 suites / +23 tests over its 38/126 baseline
  (policy, in-memory adapter, manager single-conn + EXCHANGE_DOWN
  backoff, broker auth/scope/subscribe/backpressure/shared-budget/
  cleanup/cap, gateway handshake + routing + disconnect).
- Todo 10 (P46 seguridad): `src/auth/` owns scoped API keys
  (read/snapshot/admin, SHA-256 hash-only store, dual-key 10-min grace
  rotation with zero downtime, per-key sliding-window limit, access
  audit with ids only, loopback bind default). Legacy
  `MARKET_DATA_API_KEY` stays admin-equivalent; fail-open only with
  empty env + empty store. Live `:4123` matrix: health 200 keyless,
  chains 401 nokey/wrong + 200 keyed, batch 403 read-key + 200
  snapshot-key, rotate old + new 200, revoke 204, list/audit carry
  11-char prefixes only (no hashes, no full keys).
- Todo 16 (P48-bis ccxt-first + limiter-config): `src/provider/
infrastructure/ccxt/` owns the REST adapter (14th provider —
  `CcxtService` tickers/OHLCV over the unified ccxt API with
  `enableRateLimit`, CEX-symbol coverage gate, allowlist
  `MARKET_DATA_CCXT_EXCHANGES`, optional peer by dynamic require
  with warn-once + null fail-open; full limiter config via the
  port, 600/min with OHLCV cost 5). The quote cascade runs
  ccxt-first where covered (`covers()` on the fetcher skips the
  bucket for onchain addresses — zero quota burn); merge stays
  first-non-null, order otherwise unchanged. The outbound gate
  burns one slot per cost unit and denies with an explicit
  `providerErrors` entry (fail-open). Live `:4146`: registry
  lists ccxt first, onchain snapshot merges dex+gecko
  (`ccxt: no data`), CEX symbol pends explicitly with the peer
  absent (real exchange hit operator-gated, no new deps).
- Todo 11 (P49 streaming): `src/stream/` owns on-demand ccxt
  streaming — `ExchangeConnectionManager` holds exactly ONE
  connection per exchange (lazy connect, refcounted multiplexed
  watch/unwatch, EXCHANGE_DOWN + `retryAfterMs` fan-out with 1s->30s
  backoff reconnect + re-watch while refs remain), `StreamBrokerService`
  multiplexes per-client subscriptions (P46 auth: ticker=read,
  ohlcv=snapshot, legacy env admin-equivalent, fail-open mirrors the
  HTTP guard; subscribes share the REST 60/min sliding budget via the
  SAME `gw:<ip>` key + singleton limiter; 100-sub/client cap; 128-deep
  per-client queues with drop-oldest + drop counter; disconnect
  releases every ref). Transport is Socket.IO
  (`gateway/infrastructure/ws/`, namespace `/market-data` — zero new
  deps, same stack as the backend WsGateway + dashboard client;
  native `ws` rejected: second protocol, no gain; `gateway/api/ws/`
  stays a `@deprecated` compat re-export per P50). Live `:4133`
  matrix: keyless/wrong-key handshakes UNAUTHORIZED + disconnect;
  100 subs over 2 windows stream ~13.3k ticks/3s with zero loss; REST
  p95 = 2.40ms < 500ms PASS under the fan-out; full
  unsubscribe + disconnect + re-subscribe clean (no leaks).
- Live edge verified on `:4000` (todo 5): compat snapshot returns the 12
  `MarketData` fields (null + `status: 'pending'` until todo-3
  aggregators) + echo; batch-50 `POST` → 200 + 50 snapshots in ~3ms;
  warm-burst p95 = 0.96ms < 500ms PASS (52 reqs in one 60/min window,
  `scripts/measure-slo.mjs`); second GET is `x-cache: HIT`. Numbers
  cover edge + cache only (pending shells, no provider fan-out yet) —
  re-measure after aggregators land before any staging flip (G-17).
- Live edge verified on `:4000` (pre-todo-4): 6 chains, detect
  EVM+Solana, 7 provider statuses, address snapshot per kind,
  `/tokens/*` alias pinned to kind=token, unknown kind -> explicit
  `unknown` (no crash), 404 on unknown chain, `x-cache` HIT, x-api-key
  403/200 with key set (fail-open dev otherwise). Post-todo-4 the
  registry serves 13 statuses (edge re-verify lands with todo-5 SLO).
- Todo 4 (C-DATA-01, last move): 13 adapters physically extracted from
  `apps/backend/src/data-provider/` to `src/provider/infrastructure/`
  (P47 single-level home; byte-identical copies + relative-ized port
  imports, ConfigService wiring preserved so backend keys keep flowing
  through the shims). Registry extended 7 -> 13 descriptors (+`trading`
  kind for pumpdev). Backend keeps deprecated re-export shims only
  (dual-run, local default until todo-5 HTTP cutover; removed todo 8);
  zero `from 'data-provider` imports remain in backend `*.ts`.
  chain-dexter-bot stays INTEGRATED (standalone is todo 9); its scan
  path is covered by a market-data consumer suite (gap-7).
- P30 applied at setup: `MARKET_DATA_API_KEY` in `.env.example` day one;
  Dockerfile CMD `dist/main.js`; app-level `npm run dev`; staging+prod
  env templates + DBs `onchain_bot_market_data[_staging]` from day one;
  this AGENTS.md created viva from todo 1.
- Gate T2 recorded: 6/6 backend feed areas carry
  `Moved to apps/feed-publisher` headers (todo-0 log).
- Chain-logo resolver (evidence `.omo/evidence/chain-logo.log`):
  `src/chain-logo/` owns the fetch-ONCE store
  (`uploads/chain-logo/<chain>.png`, `CHAIN_LOGO_DIR` override) —
  TrustWallet primary (`bsc` pinned to the `binance` slug) +
  CoinGecko `asset_platforms` image fallback + 1x1 PNG placeholder
  (upstream 404s logged, never thrown; unknown chains get the
  placeholder with zero network/disk touch). Gateway edge (P43):
  `GET /api/v1/chains/:id/logo` (`@Public()`, `Cache-Control:
public, max-age=86400, immutable`) + `POST
/api/v1/chains/:id/logo/refresh` (`admin` scope, the ONLY re-fetch
  path — no periodic refresh). Every `ChainInfo` carries `logoUrl`
  (`/api/v1/chains/<id>/logo`) for frontend `[logo] name` badges.
  Verified: 55 suites / 199 tests green, `tsc --noEmit` clean, live
  boot (all 6 logos fetched from TrustWallet primary, bsc via the
  `binance` slug; unknown chain 200s the placeholder; second read
  keeps mtime, refresh re-fetches).

Todo 3 REMAINS (aggregators + persistence + batch HTTP — model half DONE
via P45). Todos 8-9 PENDING (not started, no evidence).

Worktree state 2026-09-25: DIRTY (new `apps/market-data/` tree untracked;
`apps/feed-publisher/` + backend touched by parallel Tramo-2 work —
out of scope, read-only here). No commit per dirty-worktree convention
(worktree left dirty, no commit).

## COMMANDS

```bash
npm run dev -w @onchain-bot/market-data   # watch, :4000
npm test -w @onchain-bot/market-data      # jest, all specs
npm run build -w @onchain-bot/market-data # nest build -> dist/main.js
curl -s localhost:4000/api/health            # {"status":"ok"}
docker compose -f apps/market-data/docker-compose.yml up -d  # pg :5438 + redis :6385
```

## STRUCTURE

```
apps/market-data/
  src/main.ts            # bootstrap :4000 (MARKET_DATA_PORT) + ValidationPipe
  src/app.module.ts      # Config global + Health + Shared + token stub + Address + Snapshot + 4 port modules + Gateway (APP_GUARD ApiKeyGuard)
  src/health/            # GET /api/health (@Public(), skips edge auth)
  src/address/           # HEXAGONAL (todo 12, P50; R1 owns chain/): domain/ (kind + AddressIdVo + probe port) + application/ (kind detector) + infrastructure/ (known-addresses seed) + chain/ (R1: catalog+probers moved from src/chain/ — domain/ + application/ports/ + infrastructure/ + ChainModule); aggregation lives in aggregators/ + snapshot/; root files are @deprecated compat re-exports
  src/chain/             # DEPRECATED (R1): compat re-exports only (`chain/*` alias resolves to `src/address/chain/*`)
  src/aggregators/       # NEW (R1): AggregatorsModule + domain/ (AggregationPolicyPort: ordered provider list from context — kind, chain, address, fields, quota state, account credits — + failover order data from provider/) + application/ (SnapshotAggregatorService merge, verbatim from snapshot/ + DefaultAggregationPolicyService: builder order kept, ccxt-first where covered, exhausted/zero-credit sunk last)
  src/snapshot/          # HISTORY-ONLY (R1): SnapshotModule (imports Address+Chain+Provider+Holders+Aggregators) + domain/ (snapshot + quote types) + application/ (AddressSnapshotService pipeline orchestrator + janitor) + infrastructure/ (history entity + repository + migration); fetchers/merge moved out, old paths are @deprecated compat re-exports
  src/token/             # DEPRECATED (P45): thin alias of AddressModule (token = kind=token path)
  src/chain/             # HEXAGONAL (todos 2+12, P50): domain/ (ChainInfo + STATIC_CHAINS, incl. logoUrl) + application/ (DetectChainService + ports/) + infrastructure/ (static catalog + probers); root files are @deprecated compat re-exports
  src/chain-logo/        # NEW (chain-logo resolver): domain/ (TrustWallet/CoinGecko id maps + placeholder PNG + logoUrl builder) + application/ (ChainLogoFetcherPort + ChainLogoService fetch-ONCE file store) + infrastructure/ (HttpChainLogoFetcher, global fetch, 8s timeout) + ChainLogoModule (ports only — HTTP lives in gateway/ per P43)
  src/provider/          # HEXAGONAL (provider-hex): domain/ (port + descriptors + health VOs) + application/ (registry + checker; failover policy re-exports aggregators/) + infrastructure/ (todos 4+16, P47: 14 canonical adapters + ProvidersModule + R1 `quote-fetchers/` — provider-quote + outbound token-bucket gate from snapshot/); root files are compat re-exports
  src/cache/ + src/rate-limiter/  # DEPRECATED (R1): compat re-exports only (`cache/*` + `rate-limiter/*` aliases resolve under `src/shared/infrastructure/`)
  src/gateway/           # HEXAGONAL (todos 2+12, P50, P43): domain/ (edge policy: 60/min budget + batch cap/TTL + cache-key builders) + application/ (rate-limit guard) + infrastructure/http/ (the ONLY feature controllers) + infrastructure/ws/ (todo 11, P49: MarketDataWsGateway, Socket.IO namespace /market-data over the stream/ broker); the api/http/ + api/ws/ compat re-export shims were REMOVED (gateway-dedupe: zero consumers, canonical is infrastructure/)
  src/stream/            # NEW (todo 11, P49): StreamModule + domain/ (stream types + policy + ExchangeWsPort: one-conn-per-exchange contract) + application/ (ExchangeConnectionManager single-conn multiplex + backoff, StreamBrokerService auth/subs/backpressure/cleanup) + infrastructure/ (in-memory driver default + ccxt.pro driver operator-gated + factory on MARKET_DATA_STREAM_DRIVER)
  src/shared/            # HEXAGONAL (todo 12, P50, transversal; R1 owns cache+limiter): domain/ (kernel + value-objects + pure api-key helpers) + application/ (.gitkeep — no transversal use case in v1) + infrastructure/ (config + guards + filters + decorators + R1 `cache/` + R1 `rate-limiter/`, moved verbatim); old paths are @deprecated compat re-exports
  src/auth/              # NEW (todo 10, P46): AuthModule (admin key edge) + domain/ (scopes + hash/prefix helpers + record/view) + application/ (ApiKeyService hash-only store + dual-key rotation, AccessAuditService ring, ApiKeyRateLimiter per-key, RequireScope decorator) + infrastructure/http/ (ApiKeyController)
```

## MODULES

Token is absorbed (P45): `src/address/` owns the universal model
(Address = chain + address + kind wallet|token|program|exchange|
unknown) with format + optional-probe kind detection, and since R1 it
also owns chain/ (catalog+probers nested at `address/chain/`).
Aggregation lives in `src/aggregators/` (policy + merge + failover
data); `src/snapshot/` keeps history persistence + the thin pipeline
orchestrator (`AddressSnapshotService`: address resolve -> cache-first
-> policy order -> token-bucket fetch -> merge -> history persist ->
cache set). `src/token/` is a deprecated alias (module re-exports
AddressModule; TokenIdVo pins kind=token). Chain, provider, cache,
rate-limiter expose PORTS only (no controllers — P43): the sole HTTP
surface besides health is `src/gateway/` (chains + chain logos,
providers, addresses + deprecated tokens alias + compat snapshot +
batch-50 + `GatewayRateLimitGuard`; auth via global `ApiKeyGuard`).
`SharedModule`, `CacheModule`, `RateLimiterModule` are `@Global()`
(cache/limiter canonical under `shared/infrastructure/` since R1). The
14 physical adapters + `quote-fetchers/` live in
`src/provider/infrastructure/` (todo 4, C-DATA-01 + P47 + todo 16 P48
ccxt — never earlier, never under `address/`). Holders resolves through
`DevHoldingsPort` (R1). Every module is hexagonal (domain/ +
application/ + infrastructure/) with its pre-hex roots kept as
`@deprecated` compat re-exports (removal at cutover, todo 8).

## ENV INVENTORY

`.env.example` (10 vars): switches (`MARKET_DATA_ENABLED`,
`USE_DATA_SERVICE_API`), port + host (`MARKET_DATA_HOST` default
`0.0.0.0` — container default, P46; dev may pin `127.0.0.1` for
loopback-only), `MARKET_DATA_API_KEY` (inbound,
fail-open, P30 day-one), stream (`MARKET_DATA_STREAM_DRIVER`
memory|ccxt, `MARKET_DATA_STREAM_EXCHANGES` allowlist — todo 11,
P49), ccxt REST (`MARKET_DATA_CCXT_EXCHANGES` allowlist, default
`binance` first — todo 16, P48), `DATABASE_URL` + `DATABASE_SYNCHRONIZE`,
`REDIS_URL`. Templates for staging (`:4001`, DB
`onchain_bot_market_data_staging`, `SYNCHRONIZE=false`) + prod (`:4002`,
DB `onchain_bot_market_data`) next to the app.
Staging prep status (todo 8, prep only): `docker-compose.staging.yml` +
`.env.staging.template` landed DRY-RUN (host `:4001`, DB
`onchain_bot_market_data_staging`); pending operator decision: staging
secrets (`MARKET_DATA_API_KEY`, pg password) are filled on the droplet
and never committed.

## PORTS

| Env     | App   | Postgres      | Redis         |
| ------- | ----- | ------------- | ------------- |
| dev     | :4000 | :5438         | :6385         |
| staging | :4001 | :5439         | :6386         |
| prod    | :4002 | server-shared | server-shared |

No clashes with backend (:3030), ingestion (:3031), frontend (:5173),
kol-system (:3050, pg :5435, redis :6382), feed-publisher (:3040, pg
:5436, redis :6383). Staging host ports :5439/:6386 verified free
repo-wide (grep zero source/config hits; operator to confirm with lsof
on Oracle at deploy).

## HEALTH

`GET /api/health` -> `{ status: 'ok' }` (`@Public()`, skips the global
edge auth; composite probes land with later todos and never claim
liveness they don't have). Gateway edge: `GET /api/v1/chains` (6),
`GET /api/v1/chains/detect?address=`, `GET /api/v1/providers` (14 since
todo 16), `GET /api/v1/addresses/:chain/:address[?kind=]` (P45; kind hint
optional, garbage -> explicit `unknown`), `GET /api/v1/tokens/
:chain/:address` (deprecated alias pinned to kind=token).
`GET /api/v1/chains/:id/logo` -> `image/png` (`@Public()`,
`Cache-Control: public, max-age=86400, immutable`; unknown chains get
the 1x1 placeholder, 200 never 404) + `POST
/api/v1/chains/:id/logo/refresh` (`admin` scope, explicit re-fetch).
Every chain entry carries `logoUrl` (`/api/v1/chains/<id>/logo`).

## STREAM (P49, todo 11)

Socket.IO namespace `/market-data` (`MarketDataWsGateway`): auth via
`auth: { token }` or `x-api-key` header (P46, required — keyless =
`stream-error` UNAUTHORIZED + disconnect); `subscribe
{ exchange, symbol, kind, timeframe? }` -> ack `{ subscribed }`
(canonical `exchange:symbol:kind` key); server pushes `tick`
(ticker|ohlcv) + `stream-error` (EXCHANGE_DOWN carries
`retryAfterMs`). One shared connection per exchange, 100 subs/client,
128-deep queues (drop-oldest + counter), subscribes share the REST
60/min budget, disconnect frees everything. Driver:
`MARKET_DATA_STREAM_DRIVER` (memory default; ccxt = real ccxt.pro,
operator-gated).

## TS/ESLINT CONVENTIONS

Mirrors kol-system/feed-publisher: `singleQuote`, strictNullChecks/noImplicitAny,
`emitDecoratorMetadata` + `experimentalDecorators`, path aliases
`@/*` (= `src/*`, for 2+-level imports; 2026-09-27 migration),
`shared/*`, `token/*`, `chain/*` (= `src/address/chain/*` since R1),
`provider/*`, `cache/*` (= `src/shared/infrastructure/cache/*` since
R1), `rate-limiter/*` (= `src/shared/infrastructure/rate-limiter/*`
since R1), `aggregators/*` (= `src/aggregators/*`, R1), `src/*`.
Exception: `provider/infrastructure/*` keeps relative `../../domain/data-provider.port`
(backend imports those files cross-app; `@/` would not resolve under the backend project).

## TESTS

Jest (`testRegex: .*\.spec\.ts$`, `--forceExit --runInBand`). Failing-first:
every module/primitive landed with its spec in the same todo. Shared
coverage target >80% (pure units, no I/O).

## GAPS

1. Persistence entities/migrations (TypeORM wiring, `synchronize:false` outside dev).
2. `/metrics` exporter + Pino logging.
3. Redis adapters (cache + rate-limiter windows use `REDIS_URL`).
4. Address snapshot aggregators + persistence (todo 3 remainder:
   model + edge DONE via P45; aggregators + batch HTTP pending).
5. ~~Physical provider extraction (todo 4, C-DATA-01)~~ DONE
   (`src/provider/infrastructure/`, 13/13 registered; HTTP bridge +
   SLO + staged flag done todo 5, G-17 — full-aggregator cutover stays
   todo 8).
6. ~~Streaming ccxt on-demand vía ws (todo 11, P49)~~ DONE
   (`src/stream/` + Socket.IO `/market-data`; REST ccxt adapter P48
   DONE todo 16 — live-exchange hit operator-gated).
7. ~~HTTP bridge + SLO measurement + flag default (todo 5, G-17)~~ DONE
   (compat edge + batch-50 + p95 0.96ms PASS; kol-system dev flipped,
   backend default-false, staging/prod pending the 24h SLO in todo 8).
8. Legacy rename + frontend (todos 6-7, R-4/G-18/C-UX-01).
9. Deploy workflows (staging/prod) + rollback rehearsal (todo 8).
10. dexter-onchain-bot sibling (todo 9, P13).

## DECISIONS INDEX

| Decision                               | One-line                                                                                                                                                                                                                                                                                                                                     | Status in this app                                                                                                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Variante A v1 (G-16)                   | Single-BC monorepo; spec `libs/*` → `src/*`                                                                                                                                                                                                                                                                                                  | APPLIED (todo 1; mapping table in log)                                                                                                                                                                                    |
| P30 Tramo-1 lessons                    | x-api-key day one, `dist/main.js`, env templates, living KB                                                                                                                                                                                                                                                                                  | APPLIED (todo 1)                                                                                                                                                                                                          |
| C-DB-01 own logical DB                 | `onchain_bot_market_data[_staging]`                                                                                                                                                                                                                                                                                                          | PLANNED (TypeORM unwired, GAP-1)                                                                                                                                                                                          |
| C-DATA-01 providers move last          | 13 adapters move in todo 4, never earlier                                                                                                                                                                                                                                                                                                    | APPLIED (todo 4: canonical `src/provider/infrastructure/`, backend shims)                                                                                                                                                 |
| P46 extraction mechanics               | Copy + shim (byte-identical, local default; HTTP cutover is todo 5)                                                                                                                                                                                                                                                                          | APPLIED (todo 4: zero backend `from 'data-provider` imports)                                                                                                                                                              |
| P47 provider home                      | Single-level `src/provider/infrastructure/<name>/` (P43-aligned, not under `address/`)                                                                                                                                                                                                                                                       | APPLIED (todo 4 close-out relocation)                                                                                                                                                                                     |
| G-17 SLO-gated default                 | `USE_DATA_SERVICE_API=true` only with p95<500ms measured                                                                                                                                                                                                                                                                                     | APPLIED (todo 5: p95 0.96ms PASS, kol-system dev flipped, backend default-false, staging/prod gated on todo-8 24h SLO)                                                                                                    |
| P43 gateway de salida                  | `src/gateway/` owns aggregated-data HTTP; modules expose ports only                                                                                                                                                                                                                                                                          | APPLIED (todo 2: 3 controllers + edge guard, zero module controllers)                                                                                                                                                     |
| P45 address universal model            | `src/address/` absorbs token (kind discriminator); `/tokens/*` deprecated alias                                                                                                                                                                                                                                                              | APPLIED (model + detector + edge; snapshot service promoted to `snapshot/` in todo 12, P50)                                                                                                                               |
| P39 standing rule                      | AGENTS.md + CHANGELOG `## [Unreleased]` per todo                                                                                                                                                                                                                                                                                             | APPLIED (this refresh)                                                                                                                                                                                                    |
| P50 hexagonal global + snapshot module | Every module in domain/ + application/ + infrastructure/; legacy roots `@deprecated` re-exports; snapshot aggregation promoted from address/ to `SnapshotModule`                                                                                                                                                                             | APPLIED (todo 12: 32/109 identical, `tsc` + `nest build` clean, routes identical)                                                                                                                                         |
| P46 seguridad market-data              | Scoped keys (read/snapshot/admin), hash-only store, zero-downtime rotation, per-key limit, audit, loopback bind, compromise drill                                                                                                                                                                                                            | APPLIED (todo 10: `src/auth/`, 38/126 green, `:4123` curl matrix)                                                                                                                                                         |
| P49 streaming ccxt on-demand           | Single ccxt.pro WS conn per exchange (multiplexed watch) + thin stream/ broker (P46 auth, per-client subs, backpressure, cleanup) on Socket.IO gateway/api/ws, shared rate-limit with REST                                                                                                                                                   | APPLIED (todo 11: `src/stream/` + `gateway/infrastructure/ws`, 43/149 green, live `:4133` 100 subs + REST p95 intact)                                                                                                     |
| P48-bis ccxt-first + limiter-config    | ccxt FIRST where covered (CEX tickers/OHLCV) + full limiter config per provider via ports (window, quota, endpoint cost, backoff), cost-aware fail-open gate, merge untouched                                                                                                                                                                | APPLIED (todo 16: `provider/infrastructure/ccxt/` + ccxt-first fetchers + `getRateLimitConfig`, 61/232 green, live `:4146`)                                                                                               |
| Chain-logo resolver                    | Fetch-ONCE TrustWallet primary (bsc->binance slug) + CoinGecko fallback + placeholder; gateway public logo edge + admin refresh; `ChainInfo.logoUrl`                                                                                                                                                                                         | APPLIED (`src/chain-logo/` + `ChainLogoController`, 55/199 green, live 6/6 from TrustWallet primary)                                                                                                                      |
| R1 final restructure                   | chain → `address/chain/` + NEW `aggregators/` (merge + failover data + `AggregationPolicyPort` + ccxt-first/quota-aware default) + fetchers → `provider/infrastructure/quote-fetchers/` + snapshot history-only + cache/limiter → `shared/infrastructure/` + holders via `DevHoldingsPort`; `git mv` + compat re-exports, no behavior change | APPLIED (62/238 green — 61 pre-existing suites identical + 1 NEW policy spec; `tsc` + `nest build` clean; live `:4151`→`:4152` route-diff: status codes + key sets + provider order identical, values live-variance only) |

## DECISIONS

- P30 applied: `MARKET_DATA_API_KEY` in `.env.example` day one;
  Dockerfile CMD `dist/main.js`; app-level `npm run dev`; staging+prod
  env templates from setup; this AGENTS.md created viva from todo 1.
- Root `package.json` untouched (no `dev:market-data` alias — same as
  kol-system/feed-publisher; run via `-w @onchain-bot/market-data`). Kept
  read-only outside `apps/market-data/` except the mandated evidence logs
  (lockfile untouched — no new deps: all resolve via hoisted root modules,
  same as feed-publisher todos 2-8).
- Deps mirror feed-publisher minus LLM/queue stack (no `openai`,
  `bullmq`, `@nestjs/schedule` — this service has no queue, no cron, no
  LLM in v1; added in later todos only if the plan demands).
- Triplet 4000/4001/4002 + pg :5438/:5439 + redis :6385/:6386 verified
  free repo-wide (grep + lsof, see evidence log).
- Failing-first: all 10 spec files authored before their implementation
  files in this todo; suites run green after.
- P45 (address model): `src/address/` (kind enum + `AddressIdVo` +
  `AddressKindDetectorService` with hint > registry > probe > format
  precedence + `AddressSnapshotService` shared by all kinds) absorbs
  `src/token/` (deprecated alias: module re-exports AddressModule,
  TokenIdVo pins kind=token). Gateway gains `AddressesController`
  (`/api/v1/addresses/:chain/:address[?kind=]`, chain mandatory);
  TokensSnapshotController delegates as a kind=token alias.
  Format-only evidence never guesses wallet-vs-token (returns explicit
  `unknown`); the on-chain probe hook (`AddressProbe.isContract`)
  refines when present (RPC evidence lands with todo-4 adapters).
  tsconfig + jest mapper gained `address/*`.
- Todo 2 (P43 gateway): `src/gateway/` holds the only feature
  controllers (chains, providers, addresses + deprecated tokens
  alias + todo-5 compat snapshot + batch + `GatewayRateLimitGuard` 60/min/IP + cache
  (`CacheInterceptor`, `x-cache` HIT/MISS) + global `ApiKeyGuard`
  (health `@Public()`). v1 probers are format-only (no RPC — RPC
  evidence lands with the todo-4 adapter extraction). tsconfig + jest
  mapper gained `rate-limiter/*` + `gateway/*`.
- P46 (todo 4 extraction mechanics): adapters copied byte-identical
  (only the `DataProviderPort` import re-pointed to the sibling
  `core/`); Nest `forRoot`/`forRootAsync` ConfigService wiring
  preserved so backend env keys keep flowing through the shims with
  zero behavior change. Backend `src/data-provider/**` (68 files) are
  deprecated `export *` shims; 13 consumers (10 enrichment adapters +
  2 chain probers + ticker-resolver) import the canonical home via
  relative paths — local default until the todo-5 HTTP bridge (G-17).
  Failing-first: registry-13 + barrel + module-boot specs (red before
  the copy, green after); backend shim-identity + dexter-consumer
  suites pin every consumer (adversarial: first drift fails fast).
- P47 (todo 4 close-out relocation): adapters first landed under
  `src/address/infrastructure/providers/` (P45 path from the plan)
  then moved single-level to `src/provider/infrastructure/<name>/`
  (P43-aligned: provider code lives with the provider port, address
  consumes via ports only — verified zero deep imports). Plain `mv`
  (tree untracked, `git mv` refused); all 84 backend references +
  `AppModule` re-pointed; `tsc` + suites re-greened after the move.
- Provider-hex (pure restructure, no behavior change): `src/provider/`
  is now hexagonal — `domain/` (DataProviderPort, descriptors, health
  VOs) <- `application/` (registry composes the extracted
  `ProviderHealthChecker` with the identical truth table, plus an
  additive `listFailoverOrder` over the pure `ProviderFailoverPolicy`)
  <- `infrastructure/<name>/` (one dir per adapter: service + config +
  types + module). Root `provider-registry.service.ts` /
  `provider-descriptor.ts` and `infrastructure/core/` stay as compat
  re-exports so `provider/*` consumers (address, gateway) and the
  backend cross-app shims resolve unchanged; 13 adapter services now
  import the port from `../../domain/`. Verified 30 suites / 103 tests
  (identical to pre-move) + `tsc` + `nest build` clean.
- P50 hexagonal global + snapshot module (todo 12, pure restructure,
  no behavior change): chain/address/cache/rate-limiter/gateway/shared
  moved into domain/ + application/ + infrastructure/ following the
  provider-hex precedent; every pre-hex root (plus gateway `api/http/`)
  stays as a `@deprecated` compat re-export (JSDoc names the new home;
  removal at cutover, todo 8). New canonical `src/snapshot/` module
  owns `AddressSnapshotService` (moved verbatim from address/ with its
  domain types; `SnapshotModule` imports Address+Chain+Provider;
  gateway + app wire it; `address/` keeps a deprecated re-export).
  Additive-only new code: domain ports (rate-limiter, breaker,
  address-probe), gateway edge policy (60/min + batch cap/TTL + cache
  keys, extracted verbatim from guard/controller), address seed
  extraction. tsconfig + jest mapper gained `snapshot/*`. Verified 32
  suites / 109 tests (identical pre/post) + `tsc --noEmit` clean +
  `nest build` (`dist/main.js`) + boot `:4000` spot-checks (6 chains,
  detect EVM, 13 providers, per-kind snapshots, tokens alias,
  unknown->explicit `unknown`, 404 unknown chain/provider, compat
  12-field snapshot, `x-cache: HIT`, batch-2 + batch-51->400,
  65-request burst -> 200s + 429s).
- P48-bis ccxt-first + limiter-config (todo 16): REST adapter
  `src/provider/infrastructure/ccxt/` (`CcxtService` + config +
  types + module + barrel; 14th registry descriptor at 600/min,
  OHLCV cost 5) prepended to the quote fetchers with a `covers()`
  CEX-symbol gate (uncovered inputs skip the bucket — zero quota
  burn); `DataProviderPort.getRateLimitConfig()` is the per-adapter
  seam (default 60/min, 1s->30s backoff); the gate burns one slot
  per cost unit and fails open explicitly. Registry/barrel/module
  specs moved 13 -> 14. Failing-first: limiter-config + ccxt +
  cascade-order + quota-cost (incl. adversarial breach on a real
  limiter) specs red before impl, green after (+4 suites / +21
  tests, 61/232 total). tsconfig/jest mappers unchanged
  (`provider/*` covers the new dir). One necessary inline note
  kept: ccxt `supportsChains` is eligibility only, coverage is
  symbol-gated.
- P49 streaming on-demand (todo 11): `src/stream/` is hexagonal —
  `domain/` (stream types + policy + `ExchangeWsPort` one-conn
  contract) <- `application/` (`ExchangeConnectionManager` single
  shared connection per exchange with refcounted multiplex +
  EXCHANGE_DOWN fan-out with 1s->30s backoff reconnect + re-watch,
  `StreamBrokerService` P46 auth + per-client subs + shared REST
  budget + drop-oldest backpressure + disconnect cleanup) <-
  `infrastructure/` (in-memory driver default, ccxt.pro driver via
  optional-peer dynamic require on `MARKET_DATA_STREAM_DRIVER=ccxt`,
  factory). Transport: Socket.IO `gateway/infrastructure/ws/`
  (namespace `/market-data`; zero new deps — @nestjs/websockets +
  platform-socket.io + socket.io-client all hoisted; native `ws`
  rejected as a second client protocol with no gain); `gateway/api/ws/`
  is a `@deprecated` compat re-export per P50. ccxt.pro is an
  OPTIONAL peer (never in CI/lockfile): the app boots without it and
  the factory fails LOUDLY only when the ccxt driver is selected but
  missing. Failing-first: 5 specs red before impl (missing modules),
  green after (+5 suites / +23 tests, 43/149 total). tsconfig + jest
  mapper gained `stream/*`. One necessary inline comment kept:
  reconnect must re-watch (adapters drop watch-lists on disconnect).
- R1 final restructure (no behavior change, `git mv` + compat
  re-exports, additive-only new code): chain/ → `address/chain/`
  (catalog+probers; `chain/*` alias retargeted, `src/chain/*.ts` stay as
  deprecated shims); NEW `src/aggregators/` (`AggregatorsModule`:
  `SnapshotAggregatorService` merge moved verbatim from snapshot/,
  `ProviderFailoverPolicy` data moved from provider/, NEW
  `AggregationPolicyPort` + `DefaultAggregationPolicyService` —
  builder order preserved, ccxt-first where covered,
  quota-exhausted/zero-credit sunk last); fetchers →
  `provider/infrastructure/quote-fetchers/` (provider-quote +
  outbound gate + their 4 specs); snapshot/ history-only
  (`SnapshotModule` imports AggregatorsModule, drops the local merge
  provider; `AddressSnapshotService` orchestrates resolve ->
  cache-first -> policy order -> token-bucket fetch -> merge ->
  history persist -> cache set, injects `DevHoldingsPort` +
  `AggregationPolicyPort` as `@Optional()`); cache/rate-limiter/ →
  `shared/infrastructure/` (aliases retargeted, old roots are shims);
  holders via NEW `DevHoldingsPort` (`useExisting` binding —
  runtime-identical). Failing-first: the policy spec was red before
  the port/impl, green after (+1 suite / +6 tests, 62/238 total; the
  61 pre-existing suites keep byte-identical counts). Verified `tsc
--noEmit` clean + `nest build` (`dist/main.js`) + boot `:4152`
  route-diff vs pre-R1 `:4151`: status codes + response key sets +
  provider order identical (snapshot values differ only by live
  provider variance). tsconfig + jest mapper gained `aggregators/*`.
- Chain-logo resolver (permanent, fetch-ONCE, no periodic refresh):
  `src/chain-logo/` is hexagonal — `domain/` (TrustWallet/CoinGecko id
  maps with the verified `bsc`->`binance` pin + `chainLogoUrl`
  builder + 1x1 PNG placeholder) <- `application/`
  (`ChainLogoFetcherPort` seam + `ChainLogoService`: disk-hit first,
  then TrustWallet primary, then CoinGecko `asset_platforms` image,
  then placeholder persisted; unknown chains short-circuit to the
  placeholder; upstream gaps warn-log, never throw) <-
  `infrastructure/` (`HttpChainLogoFetcher` over global fetch, 8s
  timeout, null on any gap). HTTP lives in gateway/ per P43
  (`ChainLogoController`: public long-cache GET + admin POST
  refresh). `ChainInfo` gains required `logoUrl`. tsconfig + jest
  mapper gained `chain-logo/*`. Failing-first: domain + service
  specs red before impl (missing modules), green after (+3 suites /
  +16 tests, 55/199 total).

## SECURITY (P46, todo 10)

Scoped API keys (`src/auth/`): `read` (GET chains/providers/addresses/
tokens) < `snapshot` (+ batch POST + compat snapshot GET) < `admin`
(+ `/api/v1/auth/*` + chain-logo `POST .../logo/refresh`). Store holds SHA-256 hashes + 11-char display
prefixes only — plaintext exists solely in the create/rotate response
(single display, operator copies it once). No-key -> 401, wrong scope
-> 403, per-key over-limit -> 429. Audit (`GET /api/v1/auth/audit`)
records key id + name, method, path (query stripped), status — never
key material. Grep-gate spec fails the suite on any secret-like
literal or key-variable logging in auth/guard/controller sources.

Bind: `MARKET_DATA_HOST` defaults to `0.0.0.0` (container default —
loopback-in-container is unreachable via published ports; staging
backport 2026-09-27). On Oracle the service stays behind the published
loopback/host port or the Tailscale IP (staging `:4001`, prod `:4002`
same rule); dev may pin `127.0.0.1` for loopback-only.

Compromise drill (<15 min, no redeploy): 1. `GET /api/v1/auth/keys`
find the prefix. 2. `DELETE /api/v1/auth/keys/:id` (revoke, immediate
401). 3. `POST /api/v1/auth/keys` mint replacement (same scopes). 4. `GET /api/v1/auth/audit` review the key id's recent endpoints. 5. Rotate dependents to the new key; old dual-key grace covers the
switchover when rotating pre-emptively instead. v1 store is in-memory
(survives rotation without reboot; persistence = `api_keys` table
under GAP-1 with the same record shape).

## STANDING RULE

Update this file on every todo (program index + program status +
gaps + decisions) plus a `CHANGELOG.md` `## [Unreleased]` entry in
English per `RELEASE-FLOW.md` (P39). Stale knowledge base = failed todo.

## NOTES

- Coverage-expand (2026-09-28, feat/mega-refactor-tramos):
  `SolanaRpcService.getTokenSupply` (NEW; total only — no
  max/circulating leg exists on-chain) + `getTokenLargestAccounts`
  wired as the `solana-rpc` quote fetcher (solana-only, tier `free`,
  order geckoterminal -> solana-rpc -> rugcheck; `totalSupply` +
  `top10HolderPercent`, RPC down -> null never throws). Birdeye
  holder-profile + `holder_positions?labels=dev` VERIFIED as-is
  (skip-without-key, mocked specs already green — no code change).
  Live keyless (`:4161`): JUP/solana 9/17 -> 10/17
  (`+totalSupply` on-chain, `solana-rpc` in sources; top10 null —
  public RPC throttles largest-accounts with sustained 429, unit-pinned
  with mocks, Helius primary resolves it); 小股东/bsc unchanged 9/17
  (solana-only fetcher correctly skipped); SECT never probed (empty
  input, never invented). Batch keeps its legacy flat compat shape.
  Evidence: `.omo/evidence/coverage-expand.log`.

- Holders + dev-wallet (2026-09-27, feat/mega-refactor-tramos):
  `BirdeyeService.getHolderProfile` + `getDevPositions` (holder_profile
  tags incl. dev hold_amount/percent_of_supply/PnL + holder_positions
  `labels=dev`) feed `src/holders/DevHoldingsService` (Birdeye ->
  Helius first-tx feePayer probable -> explicit nulls; solana-only).
  `SnapshotQuote` gains `devWallets[]` + `devPctSupply`; compat edge
  returns 17 fields. Evidence: `.omo/evidence/holders-dev.log`.

- Supply fields (2026-09-27, feat/mega-refactor-tramos): `SnapshotQuote`
  carries `totalSupply` + `circulatingSupply` + `maxSupply` (all-nullable;
  first-non-null merge prefers real values, providers without supplies
  merge nulls without crashing). Wired fetchers: geckoterminal
  (`total_supply` string→number), birdeye (`totalSupply`), mobula
  (`totalSupply` only), coingecko (`total_supply`/`circulating_supply`/
  `max_supply` — types + service extended; new fetcher with the
  CoinGecko platform map). Dexscreener/moralis/rugcheck carry no supplies
  (null). `snapshot_history.quote` is jsonb — no migration needed; the
  compat edge `GET /api/market-data/snapshot` returns 15 fields.
  Evidence: `.omo/evidence/supply-fields.log`.

- Gate T2 record: `.omo/evidence/task-0-mega-refactor-market-data.log`
  (6/6 backend feed areas with `Moved to apps/feed-publisher` headers).

- Zero-cost cascade (2026-09-28, feat/mega-refactor-tramos,
  consumer-probe): quote fetchers run free-first ordered by coverage —
  `ccxt` (CEX-only via `covers()`) → `dexscreener` (broadest onchain) →
  `geckoterminal` (broad onchain + supplies) → `rugcheck` (free
  security fields) — then keyed fallback `birdeye` → `coingecko` →
  `mobula` → `moralis` (null without keys, never throwing). Tiers pinned
  in `QUOTE_FETCHER_COST_TIER`
  (`provider/infrastructure/quote-fetchers/provider-quote.fetchers.ts`)
  - `zero-cost-cascade.spec.ts` (order + all-null aggregate + real
    keyless-adapter skip, adversarial: paid call without key resolves
    null, never 401-crashes). Rate limiters respected per provider via
    the outbound token-bucket gate (budgets from the registry
    descriptors). Live probe (no keys in env, $0 spend): JUP/solana +
    小股东/bsc both `ready` 9/17 fields from free sources only
    (dexscreener + geckoterminal); SECT has no input
    (`docs/addresses-testing/SECT.md` empty — not probed, never
    invented). Evidence: `.omo/evidence/zero-cost-probe.log`.

- `libs/*` → `src/*` mapping (G-16): providers →
  `token/infrastructure/providers`; aggregators →
  `token/application/services`; cache/rate-limiter → own modules;
  shared-kernel → `shared/`; chain probers → `chain/`. Variante B stays
  a gated later phase — no module invented without a mapping row.
