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
docker compose -f apps/market-data/docker-compose.yml up -d  # standalone pg :5438 + redis :6385 (centralized dev uses single pg :5432, see docker-compose.dev.yml)
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
  src/launchpad/ # NEW (dexter-launchpad Wave 1, Lane D): `LaunchpadModule` (imports SolanaRpcModule, exports detector + `LAUNCHPAD_DETECTOR` port) + domain/ (`launchpad-info.ts` `LaunchpadInfo{id,name,url}`, `launchpad-table.ts` ratified table as data: R1 §5 ORDER arrays, program IDs + factory sets, marker allowlists, canonical URLs with pump.fun `/coin/` pinned, defined.fi fallback, `EVM_RECEIPT_EXCLUDED` presale rows, keyless EVM transports) + application/ (`launchpad-detector.service.ts`: ordered strategies, FIRST match wins, 10s timeout, never throws; Solana ONE batch + heaven REST, EVM bankr/mintclub API + ONE Blockscout creation + ONE receipt vs factory table) + infrastructure/ (`solana-pda.ts` zero-dep `findProgramAddress`); `solana-rpc.service.ts` gains `getMultipleAccounts` batch; `snapshot.launchpad` resolved live per call (never persisted, detector `@Optional()` with explicit-token inject)
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
`DevHoldingsPort` (R1). Origin-launchpad detection lives in
`src/launchpad/` (dexter-launchpad Wave 1, Lane D:
`LaunchpadDetectorService` behind `LAUNCHPAD_DETECTOR`, input
`(chain, address)` only — zero market-data dependency; ordered
brand-before-infra strategies, 10s overall timeout, never throws;
`snapshot.launchpad` resolved live per call, never persisted to
history). Chain-honest snapshots (dexter plan todo 18): every
snapshot carries an explicit chain, so the dexscreener quote fetcher

- `snapshot.venue` resolve through the STRICT per-chain path
  (`getBestPairSummaryForChain`: `DEXSCREENER_CHAIN_SLUGS` maps our 6
  ids 1:1 to DexScreener slugs, `GET /token-pairs/v1/<slug>/` answers
  a bare pair array, STRICT `chainId === slug` filter before the
  best-liquidity pick). Unmapped chain or chain with no pair resolves
  `null` — never a sibling chain's data, never a network call for an
  unmapped slug. The legacy cross-chain `getBestPairSummary` stays for
  bare/unknown-chain callers only (best-effort mode, pinned in spec).
  Pair-side attribution (dexter plan todo 20): the best-liquidity pair
  may carry the requested mint on EITHER side, so `DexScreenerPairSummary`
  carries BOTH `baseToken` and `quoteToken` and the dexscreener quote
  fetcher is the ONLY identity step — the mint must equal one side's
  address (case-insensitive) and that side's symbol/name wins; a pair
  with our mint on neither side is discarded (null, never throws).
  The legacy `getBestPairSummary` is `@deprecated` (cross-chain +
  side-unverified; mocked by gateway specs, kept working, no new
  callers). Backend `dexscreener.adapter` + `ticker-resolver` keep
  their own reads (other app, other plan — excluded here by design).
  Every module is hexagonal (domain/ +
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
Provider keys (provider-keys wire): `BIRDEYE/HELIUS/MORALIS/COINGECKO/
COINMARKETCAP/ALCHEMY/MOBULA/PUMPDEV/FLUXRPC_API_KEY` +
`HELIUS_RPC_URL_{MAINNET,DEVNET}` + `PUMPDEV_WALLET_{PUBLIC,PRIVATE}` +
`FLUXRPC_{RPC,WS}` flow through the `app.*` namespaces in
`shared/infrastructure/config/app.config.ts` (empty = skip-without-key,
adapter returns null, never throws). `AppModule` loads them via
`ConfigModule.load: [appConfig]` — without the `load` entry every
`cs.get('app.*')` resolves undefined and all keyed adapters stay dark.
`solanaRpc.primaryRpcUrl` reuses `HELIUS_RPC_URL_MAINNET` (public-RPC
fallback otherwise); moralis quote fetcher is EVM-only (solana
snapshots correctly skip it). `CHAINSTACK_CHAINS` (empty = all rows)
pins which chains may call the Chainstack free tier — free allows ONE
chain per endpoint, so unlisted rows skip silently instead of burning
seconds on 401s.
Staging prep status (todo 8, prep only): `docker-compose.staging.yml` +
`.env.staging.template` landed DRY-RUN (host `:4001`, DB
`onchain_bot_market_data_staging`); pending operator decision: staging
secrets (`MARKET_DATA_API_KEY`, pg password) are filled on the droplet
and never committed.

## PORTS

| Env     | App   | Postgres          | Redis         |
| ------- | ----- | ----------------- | ------------- |
| dev     | :4000 | :5432 (single pg) | :6385         |
| staging | :4001 | :5439             | :6386         |
| prod    | :4002 | server-shared     | server-shared |

No clashes with backend (:3030), ingestion (:3031), frontend (:5173),
kol-calls (:3050, DB `onchain_bot_kol_calls`, redis :6382), feed-publisher (:3040, DB
`onchain_bot_feed_publisher`, redis :6383). Staging host ports :5439/:6386 verified free
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
operator-gated). DEX source: `exchange: 'birdeye'` always builds the
Birdeye WS client (`provider/infrastructure/birdeye/birdeye-ws.client.ts`
— `wss://public-api.birdeye.so/socket/solana`, echo-protocol,
SUBSCRIBE_PRICE 1m + SUBSCRIBE_TXS + SUBSCRIBE_NEW_PAIR verbatim,
`symbol` = mint verbatim; key from `BIRDEYE_API_KEY`, loud without it;
allowlist via `MARKET_DATA_STREAM_EXCHANGES`; evidence
`.omo/evidence/birdeye-ws.log` — market pushes Premium-gated, mocked
suite is the gate).

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
- Triplet 4000/4001/4002 + dev single pg :5432 / staging pg :5439 + redis :6385/:6386 verified
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

## TRANSPORT (Lane T, dexter plan todo 22 — on-chain fast-path foundation)

Fail-open everywhere, timeouts via AbortController (a race alone never
cancels the socket). Frozen Lane S/E reader contracts — DO NOT rename:
`BatchAccountsClient.getMultiple` (`solana-rpc.types.ts`),
`ChainRpc.getCode/getTransactionCount/ethCall` (`alchemy.chains.ts`),
`MulticallClient.tryAggregate` (`multicall.service.ts`).

- Solana: `getMultipleAccounts` chunks ≤100 in ONE parallel round and
  concatenates in order; a dead chunk resolves per-address `null`s
  (never whole-batch `null`, never throws). 150 PDAs = 2 calls.
- EVM: ONE table `EVM_CHAIN_TRANSPORTS` drives endpoints
  (`eth/base/bnb→bnb-mainnet/arb/polygon/opt/unichain` subdomains) and
  Multicall3 support. Multicall3 `0xcA11…CA11` (verified 7/7 on
  2026-10-05) batches `eth_call`s with tryAggregate semantics (one
  revert never fails the batch); aggregate miss/timeout (7.5 s abort)
  falls back to parallel per-call `eth_call`s (5 s abort each).
  Robinhood has NO row (unverified — all-false fail-open).
- FluxRPC: `getAccountInfo` reads `base64` (struct-decodable) beside
  the untouched `jsonParsed` batch reads (unusable for structs).
- QPS budget (assumptions in code): Alchemy free ≈ 300M CU/mo; one
  20-call aggregate ≈ 26 CU flat (vs 26×N individual);
  `eth_getCode`/`eth_getTransactionCount` ≈ 20 CU each. Quota owner:
  whoever holds `ALCHEMY_API_KEY`.

## RPC FALLBACK TIERS + ROBINHOOD (todo 24 — supersedes the Robinhood-NO-row note above)

Every chain-routed EVM call (`AlchemyService.rpcCallForChain`, feeding
`ChainRpc` + `MulticallService`) walks tiers per call, first
non-null wins: Alchemy (only when `ALCHEMY_API_KEY` set) → dRPC free
(only when `DRPC_API_KEY` set AND the chain has a verified
`DRPC_NETWORKS` slug) → keyless public RPC (launchpad-table URL,
always available) → honest `null`. Unknown chain ⇒ `null` zero
network. JSON-RPC errors and null results fall through (never stop
the chain); each tier has its own timeout (Alchemy 8s,
`EVM_RPC_TIER_TIMEOUT_MS` 5s elsewhere); success logs
`evm-rpc <chain> <method> served-by=<tier>` (debug) for quota
decisions. Owner action: create a free key at drpc.org and set
`DRPC_API_KEY` (see `.env.example`) — without it the tier skips
silently. dRPC slugs verified: ethereum/base/bsc/arbitrum/polygon/
optimism; robinhood + unichain have NO dRPC row (unverified — never
guessed). Robinhood coverage: `EVM_CHAIN_TRANSPORTS.robinhood`
(`robinhood-mainnet`, chainId 4663, Multicall3 verified PRESENT via
`eth_getCode` 2026-10-06: full bytecode, `eth_chainId` → `0x1237`) +
DexScreener slug `robinhood` (live 2026-10-06:
`GET /token-pairs/v1/robinhood/0x968B…5583` → 200, `uniswap` v4
NYMA/ETH, liq ~$6K — fixture pinned in
`dexscreener-robinhood.spec.ts`). Boundary: `STATIC_CHAINS` has no
robinhood row, so `GET /snapshot(chain=robinhood)` still 404s
unknown-chain (catalog row is a separate todo, not this one).

## ONCHAIN READERS (Lane S, dexter plan todo 22 — Solana fast-path)

`src/provider/infrastructure/onchain/` decodes pool state straight
from chain accounts (pump curve, Raydium AMMv4/CPMM/CLMM, Orca
Whirlpool, Meteora DLMM/DBC) plus token supply/holders/metadata —
no aggregators, no indexer, no gRPC, no new deps (Buffer/DataView +
repo `solana-pda.ts` only). Family dispatch is by account OWNER
program (CPMM/CLMM share the `PoolState` discriminator, so the
discriminator alone never selects the family); every decoder is
discriminator + length guarded and returns `null` (never throws) on
unknown/short/uninitialized data. Program IDs are R1 pins or
on-chain-observed + IDL-cross-checked (see `solana-program-ids.ts`:
CLMM lives at `CAMMCzo5...`, DLMM at `...VaPwxo`, CPMM at
`...QB5qKP1C` — the strings from memory were wrong and are
documented there as such). Findings that constrain callers: AMMv4
`poolOpenTime` reads 0 on live legacy pools (not an init signal);
Raydium `status` reads 0 on live CPMM/CLMM pools (not an init
signal); DBC `isMigrated` pools still decode (post-migration
leftovers — aggregator decides freshness). Token-2022: base-82B
header identical to classic SPL, extensions past byte 82 flagged via
`hasExtensions`. `OnchainSolanaReaderService` composes pool views
(vault/mint batch + supply-for-decimals) and token basics
(supply + largest-accounts + metadata PDA in ONE `Promise.all`).
NOT wired into the snapshot pipeline (later todo); holders live
fixture pending (public-RPC `getTokenLargestAccounts` 429-walled —
spec uses labeled synthetic holder math until the capture lands).

## EVM READERS (Lane E, dexter plan todo 22 — EVM fast-path)

`src/provider/infrastructure/onchain/evm-pools.codec.ts` (pure ABI
decode: V2 getReserves/token0/token1, ERC20 decimals/totalSupply, V3
slot0/liquidity/fee, V4 StateView getSlot0/getLiquidity + price math)

- `onchain-evm.reader.ts` (`OnchainEvmReaderService`: V2/V3/V4 views
  over the frozen Lane T `MulticallClient.tryAggregate` + `ChainRpc`
  existence gate, BigInt-first, decimals per leg, never throws) +
  `evm-tolerance.ts` (direct-vs-aggregator bps check at the snapshot
  seam, log-only). NEW files only — Lane S files and the onchain barrel
  untouched; snapshot/aggregator/gateway byte-identical (no wiring yet).

* Selectors DERIVED 2026-10-05 (`keccak256(signature)[:4]`, env
  pycryptodome — no new dep), not memorized: the live probe below
  closed the loop on `getReserves=0x0902f1ac`, the recomputed
  `tryAggregate` selector matches Lane T's `bce38bd7` byte-for-byte,
  and derivation corrected memory on V3 `liquidity` (`0x1a686502`,
  not `0x1a686774`).
* Live proof (ONE probe, public RPC, rate-limit friendly):
  DexScreener-discovered Uniswap V2 WETH/USDC
  `0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc` (ethereum) via
  tryAggregate returned reserve0=10543620724770 (~10.54M USDC) /
  reserve1=3881028913582414867556 (~3881 WETH) / fresh timestamp —
  plausible vs ~$21M DexScreener liquidity. Pinned as
  `LIVE_V2_TRYAGGREGATE_RETURN` in `evm-pools.codec.spec.ts`.
* Uninitialized rule: V3/V4 `sqrtPriceX96 == 0` -> `null`; V2
  double-zero reserves -> `null`. Fee semantics: V2 reserve ratio is a
  PRE-FEE mid (execution haircut `V2_DEFAULT_FEE_BPS`, v2-INCLUSIVE);
  V3 slot0 / V4 lens quote fee-FREE spot (add `fee`/`lpFee` on top,
  v4-EXCLUSIVE).
* V4 lens per chain: StateView verified ONLY on ethereum + base
  (official v4 deployments table); bsc/arbitrum/polygon/optimism/
  unichain resolve `null` (`v4-lens-unverified`) — no invented rows.
* Tolerance seam: `selectPreferredQuote(direct, aggregator)` merges
  defined direct fields over today's fan-out (partial direct never
  blanks good fields; direct `null` returns the aggregator quote
  verbatim); `priceUsd` divergence beyond `TOLERANCE_DEFAULT_BPS`
  (100 = 1%) is a `Logger.warn` ONLY — no metric infra, no gates,
  render never blocked. Home is `onchain/` (not `snapshot/`) so the
  lane ships with zero snapshot-core edits; adoption is one line in
  `getSnapshot` post-merge, pre-`history.save` (documented in file).
* QPS budget lives in the codec header (per-view ~= 72 CU worst /
  ~= 46 CU steady; readers never poll — a future integrator owns
  cadence: 100 pools x 30s ~= 153 CU/s OVER free ~115 CU/s).
  Quota owner: whoever holds `ALCHEMY_API_KEY`.

## DIRECT FAST-PATH (wire-up, dexter plan todo 22 — serve order + deadlines)

`snapshot/application/direct-fast-path.service.ts` (NEW) + a seam in
`AddressSnapshotService.getSnapshot` (fast branch + `buildSnapshot`
extraction; the fallback call reproduces the old inline behavior
exactly — existing specs pin it with the fast path mocked null).

- Order per request (cache-HIT still returns first, unchanged):
  fan-out starts IMMEDIATELY and concurrently; the on-chain readers
  race `DIRECT_FAST_PATH_DEADLINE_MS` (800ms) against it. Sane
  direct values serve at direct speed (partial card: direct
  price/liquidity/holders/supply/identity, N/A nulls elsewhere, dev
  holdings skipped and marked); the in-flight fan-out completes in
  background for the log-only tolerance check (no second run, no
  history/cache/registry writes from the background leg). ANY direct
  miss awaits the already-running fan-out — fallback pays ~zero
  direct penalty on fast misses and ~800ms only when readers hang
  to the deadline (measured: concurrent fallback totals improved
  ~6.1s to ~3.3s on WIF-class colds by removing the old sequential
  wait — the remainder is launchpad/dev/venue tail, not fan-out).
- Deadline enforcement is race-based (frozen Lane T transports take
  no external signal; abandoned sockets die on their own internal
  timeouts). Latency discipline inside the budget: discovery, pool,
  basics, launchpad and the lean anchor all start at t0; launchpad
  is take-if-ready (slow detector resolves null, never waits); the
  pump pool leg is skipped when discovery names the curve PDA
  itself (duplicate read). Union-typed ctor params carry explicit
  `@Inject` (else Nest emits `Object` metadata and resolves null —
  same latent pattern as the pre-existing `cache`/`assets`/
  `nullMetrics` params: observed during wire-up, NOT changed).
- Coverage (honest): Solana pump-PDA (no discovery needed),
  Solana pools via DexScreener pairAddress (owner dispatch),
  EVM V2/V3 via best-pair discovery (V4 poolIds not discoverable).
  USD only against a stable leg or a pinned native anchor (lean
  1-round Raydium CLMM SOL/USDC, AMM fallback; ethereum WETH/USDC
  Lane-E-verified). Anything else resolves null (not covered).
- MEASURED 2026-10-06 (alt-port :4171, 15 colds, evidence
  `.omo/evidence/task-fe-onchain-wire.log`): p95 cold <800ms MISSED
  on all live routes — direct legs always hit the 800ms deadline
  (Helius 2-sequential-round paths ~= 900-1200ms typical; Alchemy
  403 on ALL EVM subdomains — app has no enabled networks, so EVM
  direct always nulls here), and cold totals (~2.6-3.4s) are
  launchpad/dev/venue-tail-dominated. Reader-level parity PROVEN
  live (real Helius through real reader code): pump-curve -3.8bps,
  Raydium AMM -27.6bps vs aggregator (tolerance 100bps); pumpswap
  pool resolves null (unsupported family, fail-open). Serve-level
  parity had zero samples (no fast serve fired) — needs a keyed EVM
  env and/or sub-800ms round trips to revisit.

## GECKO COVERAGE (todo 25 — robinhood + full network audit, 2026-10-06)

Per-provider slug map lives in `provider-quote.fetchers.ts`
(`GECKO_NETWORK_SLUGS` + `GECKO_SUPPORTED_CHAINS`); the catalog
mirror is `ChainInfo.geckoTerminalSlug` (informational, zero
consumers). All slugs below verified live via `GET /networks`
(pages 1-3, ~226 networks).

| Our chain | Gecko slug    | Snapshot consults gecko | Verdict                                                                                        |
| --------- | ------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| ethereum  | `eth`         | yes                     | include (pre-existing)                                                                         |
| solana    | `solana`      | yes                     | include (pre-existing)                                                                         |
| bsc       | `bsc`         | yes                     | include (pre-existing)                                                                         |
| base      | `base`        | yes                     | include (pre-existing)                                                                         |
| arbitrum  | `arbitrum`    | yes                     | include (slug existed, fetcher never consulted it — fixed)                                     |
| polygon   | `polygon_pos` | yes                     | include (slug existed, fetcher never consulted it — fixed)                                     |
| robinhood | `robinhood`   | yes                     | include (this todo; pool fallback carries FDV)                                                 |
| optimism  | `optimism`    | no                      | exclude-with-reason: no `STATIC_CHAINS` row (snapshot 404s first); slug mapped for catalog day |
| unichain  | `unichain`    | no                      | exclude-with-reason: same as optimism (owner cases noted; include when catalog lands)          |

Pool fallback rule (`selectPoolQuote`, pure, never throws): token
`/info` first; when price or fdv is null, ONE extra call to
`GET /networks/{network}/tokens/{address}/pools` fills ONLY the gaps
from the highest-`reserve_in_usd` pool whose relationship id matches
our address — pool `fdv_usd` is base-token FDV, so a quote-side token
takes price only, never fdv (same misattribution class as todo 20).
Info miss → null (no phantom tokens); pools miss/throw → info quote
survives. Live proof: STAGEVEIL `0xcf7f…f3597` (DexScreener 0 pairs
even cross-chain) → symbol/holders via info + FDV `3471.76` via pool
`robinhood_0x9269…ef60` (reserve $5737; higher-fdv pools with ~$0
reserve correctly lose). Extra call costs one gecko request only on
the fdv/price-null path (free tier ~10-30 req/min — the common
info-complete path is unchanged).

## ROBINHOOD ENRICHMENT (todo 26 — pons leg + gecko venue, 2026-10-06)

Both legs viable keyless (decision gate MATCH/MATCH, live evidence
`.omo/evidence/task-fe-robinhood-enrich.log`):

- Pons origin leg (`LaunchpadDetectorService.detectPons`,
  robinhood-scoped, after mintclub / before factory receipt): keyless
  single `GET https://www.ponsfamily.com/launchpad/<address>` (SSR).
  Launched token → `<title>NAME ($SYM) · pons</title>` + `<link
rel="canonical" href="…/launchpad/<address>"/>`; unknown → `<title>Buy
token · pons</title>` with zero canonical tags (unknown addresses DO
  echo in Next.js flight data, so the guard checks the canonical LINK,
  not a bare substring). Both conditions required — redesign fails
  open to null. Public Robinhood RPC (`eth_chainId` → `0x1237` live)
  and deployer-pattern receipt matching need no Pons factory set, so
  neither is wired (documented, not omitted). Returns
  `launchpadInfo('pons', …)` — pre-existing `pons` table row, zero
  table-shape change, zero registry change.
- Gecko→venue fallback (`AddressSnapshotService.resolveVenue`):
  DexScreener hit wins (gecko never fires); on miss/throw, ONE
  `getTokenPools` call feeds `snapshot.venue` verbatim from the best
  pool's `relationships.dex.data.id` with empty labels (live STAGEVEIL:
  DexScreener `[]` even cross-chain → `pons-v2-dex`, reserve $5737).
  No `?include=dex` needed (id rides the default pools response).
  Dexter's display table capitalizes unknown ids, so the card stays
  non-empty with no new table on either side. Venue NEVER feeds
  `launchpad` (spec-pinned separation); `dexId` ≠ `launchpad.id`.

## PONS LEG RE-PIN (todo 34, 2026-10-10)

Site redesign retired the todo-26 page shape: both launched and
unknown addresses now answer `| Pons` titles AND ship a canonical
link carrying the address, so neither discriminates. `detectPons`
(now: token-specific `<title>… | Pons</title>` with the generic
`Token | Pons` shell rejected, PLUS robots-index guard — launched
pages carry `index, follow`, the shell `noindex, nofollow`) re-pinned
against live captures (NYMA `0x968B…5583` match vs `0x…dead` shell).
Both conditions required — redesign fails open to null. Pinned
Pons factories (`EVM_FACTORY_SETS.pons`, R1-era) verified live with
code on 4663 via keyless public RPC (`eth_chainId` → `0x1237`),
so the receipt leg still backstops the SSR leg; Blockscout
`getcontractcreation` is Cloudflare-walled from this network
(documented, not wired around). PONYO (`0x8589…`, prefix only —
full address never recorded) NOT probed, never guessed; sibling
todo 33 owns the PONYO case. Evidence:
`.omo/evidence/task-fe-pons-leg.log`.

## DETECTOR OWN DEADLINE + PONS CACHE (todo 35, 2026-10-10)

The Pons SSR leg measures ~1.3s live (server-rendered page) and NEVER
fit the 400ms snapshot-tail extras budget (NYMA resolved `launchpad:
null` via `tail:launchpad` timeout) — so the detector is OUT of that
budget now:

- DEADLINE (config default, not hardcoded): env
  `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS`, default 2000
  (`resolveDetectorSlowLegTimeoutMs` in
  `launchpad-detector.service.ts`; non-finite/<=0 → default). ONE
  value, two consumers: the Pons SSR AbortController cut inside the
  detector AND the snapshot tail's launchpad wait
  (`launchpadTailMs`, read at construction like `staleMaxAgeMs`).
  Venue/dev keep the shared 400ms `SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS`
  intact (their timeout note text is byte-identical; launchpad names
  its own `detector budget <ms>ms` note).
- SCOPE (only-when-slow): the deadline only MATTERS when the
  detector runs long. EVM slow legs run PARALLEL (bankr ‖ mintclub ‖
  pons via `Promise.allSettled` under the ONE shared wall-clock
  deadline — total ~= max, not sum — so the live ~1.6s bankr 404 +
  ~1.3s Pons SSR fit the ~2s default together); precedence is by
  POSITION not finish order (bankr > mintclub > pons, unchanged), and
  the factory receipt fallback fires ONLY on API all-miss (a bankr/
  Pons hit short-circuits with zero extra fetches — fast-path timing
  unchanged when they hit). Chain gates unchanged (bankr on
  `BANKR_CHAINS`, Pons on `PONS_CHAINS`/robinhood; Solana PDA batch +
  heaven untouched); each leg owns an AbortController cut at the same
  instant (no leg outlives the budget); all-fail is fail-open null.
  The detector outer 10s `DETECTOR_TIMEOUT_MS` still caps everything.
  Axios `timeout: 8s` stays as an outer backstop — the abort is the
  operative bound.
- CACHE (existing primitive, NO new table): positive `pons`
  resolutions cache on the shared global `CacheService`
  (`pons:launchpad:<chain>:<mint>`, lowercased, TTL env
  `PONS_CACHE_TTL_DAYS` default 14 — inside the 7–30d band).
  Decision record: a new DB table (discovery-cache pattern) was
  rejected — origin is IMMUTABLE per mint (a migration mints a NEW
  address), so no dexId-style tripwire schema is needed; the TTL is
  a memory-hygiene bound, not a correctness bound. Nulls are NEVER
  written (19a no-negative-cache); cache failures swallow fail-open;
  cache ABSENT (hand-built specs, partial DI) → straight to SSR,
  byte-identical to pre-cache. The cache lives INSIDE the detector,
  so all three snapshot-path callers benefit (tail `resolveLaunchpad`
  - both direct-fast-path `detectLaunchpad` take-if-ready legs).
    Memory-store + reset-on-deploy ACCEPTED (same tradeoff as the
    breaker); Redis swaps in via the same port with zero consumer
    change. Evidence: `.omo/evidence/task-fe-detect-budget.log`.

## FLAP INTAKE (todo 44 Phase B, 2026-10-12 — owner-ratified)

- SCOPE (factory-gate suffices): Phase A
  (`.omo/evidence/task-fe-flap-intake.log`) proved the SSR-fallback
  leg CLOSED (flap.sh serves a JS shell — launched AND dead pages
  byte-identical modulo deploy-hash noise, generic titles, no robots
  markers — so a 200-status check is PROHIBITED as proof) and the
  receipt-factory path VIABLE (Portals cited + getCode-verified +
  transports exist). Owner ratified: factory-gate suffices, 🦋
  confirmed, spec 22→23 included, xlayer/monad transports deferred.
- TABLE (`launchpad-table.ts`, ADD-only): `EVM_LAUNCHPAD_ORDER` gains
  `flap` AFTER the pons/four-meme cluster, BEFORE the
  presale-pattern rows (specific brand with a factory set, not a
  per-sale pattern); `EVM_LAUNCHPAD_ROWS.flap` builds the chain-scoped
  canonical `https://flap.sh/<chain>/<address>` (`bsc`/`bnb` →
  `bnb` slug, `robinhood` → `robinhood`; short form NOT canonical);
  `EVM_FACTORY_SETS.flap = {chains:['bsc','robinhood'],
factories:[0xe2cE…C9De0 (bnb), 0x2660…Eb09 (robinhood)]}` verbatim
  from the canonical docs page (fetched 2026-10-12, never from
  memory); `flap` is DELIBERATELY absent from
  `EVM_RECEIPT_EXCLUDED` so `RECEIPT_MATCH_ORDER` includes it.
- CHAIN VERDICTS (Portal cited or excluded with reason, never
  silent): bnb/robinhood INCLUDE (Portal + transport); xlayer
  (`0xb30D…`) + monad (`0x30e8…`) DOCUMENTED-DEFERRED (Portals cited,
  no `EVM_CHAIN_TRANSPORTS` row — separate intake scope, unknown
  aliases resolve null with ZERO fetch); morph EXCLUDED (NO Portal
  row on the canonical page — factory-matching would be invention).
- DETECTOR (existing Phase-2 machinery, NO new fetcher): the Portal
  is a CREATE2 deployer (launch tx targets Portal → receipt `to` ==
  Portal), the exact shape `detectFactoryTo` already matches.
  Positional precedence: Phase-1 (bankr > mintclub > pons) beats
  factory by construction; within the table, order position wins
  (no overlap: distinct chains/factories). Flap positive cache on the
  SAME shared `CacheService` (`flap:launchpad:<chain>:<mint>`,
  lowercased, env `FLAP_CACHE_TTL_DAYS` default 14): checked FIRST
  inside Phase 2 (hit skips Blockscout + receipt), written ONLY on a
  fresh flap resolution, nulls NEVER (19a). Graduated-state note:
  the creation receipt is immutable, so bonding vs graduated share
  the fixture — one fixture suffices, no per-state legs.
- SPECS (`launchpad-detector-flap.spec.ts`, 11 tests): plan-fixture
  match (`0xdc45…` → `flap` + `flap.sh/robinhood/…`), checksum-case
  match, BNB-alias match (`bnb` URL), no-match null, graduated
  independence, deferred-chain zero-fetch, shared-deadline abort,
  cache-hit spy, nulls-never-cached, absent-cache parity, TTL
  contract. Dexter mirror: `LAUNCHPAD_CATALOG.flap` +
  `KNOWN_LAUNCHPAD_IDS` 22→23 with a parity spec; DisplayMap
  `{launchpad,flap,🦋}` verified present via API (verify-only, no
  create). Evidence: `.omo/evidence/task-fe-flap-intake.log`
  (appended Phase B).

## OHLC-DERIVED 24H CHANGE (todo 33, 2026-10-10)

Fallback leg for Gecko-only tokens (STAGEVEIL-pattern: `/info` has no
change field, DexScreener has no pair). Viability verified keyless
before any code (3 probes, rate-limit friendly): `GET
/networks/robinhood/pools/0x9269…ef60/ohlcv/hour?aggregate=1&limit=30&currency=usd&token=base`
answers HTTP 200 with `ohlcv_list: [ts, o, h, l, close, vol][]`,
epoch seconds, trade-gated (no trade, no candle — the 30-row window
spans 2026-09-26→2026-10-06 with a 55h gap; PONYO `0x8589…` never
probed — prefix only, never guessed).

- PRECEDENCE (structural): `resolveDerivedChange24h` early-returns on
  any non-null merged change, so DexScreener/Birdeye/CoinGecko/
  Moralis/Gecko-info natives ALWAYS win with zero extra calls. The
  leg (pool discovery + ONE OHLC call) fires only when every native
  is null; provenance lands in `sources` as `geckoterminal-ohlcv`.
- WINDOW (pinned): now-leg = newest candle ≤ request time, at most
  6h old; past-leg = candle nearest exactly-24h-ago within ±2h.
  Anything else → honest null (never interpolated, never partial).
  Pure `deriveChange24hFromOhlcv` (wall-clock via `nowMs` only).
- COST: gap snapshots only (healthy ones pay nothing); at most +2
  Gecko calls there, outside the 400ms tail budget (fail-open).
  Live STAGEVEIL today resolves null honestly (newest candle
  2026-10-06, ~3.4d stale) — the leg proves itself on the pinned
  real-fixture specs, not on a quiet pool. Evidence:
  `.omo/evidence/task-fe-ohlc-change.log`.

## OHLC BACKFILL FOR 24H-WINDOW + ATH (todo 46, 2026-10-13)

One-time per-pool seed on the first encounter with a Gecko OHLC
pool, camino al honesto `0%` (window covered = backfilled history +
live price; stale-candles-alone still resolve null per the todo-33
rule; inferred flatness as `0%` stays forbidden).

- SEED (piggyback, never a dedicated fetch): `seedOhlcvBackfill`
  builds rows from the derivation fetch's candles via pure
  `buildOhlcvSeedRows` (`snapshot/domain/snapshot-ohlcv-backfill.ts`):
  `createdAt` = CANDLE time (not now), `priceUsd` = close, `fdvUsd`
  = close x CURRENT supply via the existing `computedFdvOf` seam
  (historical supply taken identical to current — approximation
  pinned in code, janitor ages rows out on the normal 90d), tag
  `quote.fdvProvenance: 'computed'` (reused, no new value), window
  [now-26h, now], gaps seed nothing. Idempotency falls out of the
  existing `unique(key, createdAt)` (`saveSeeded`: `23505` collides
  to null, in-memory mirrors the skip — no guard table, no
  migration). Status `ready` (real measurements; a seeded row can
  serve stale when zero live rows exist — honest thin card,
  documented here).
- DERIVATION (outright-24h vs now-live, primary): `findAnchorAt`
  reads the history anchor (backfill + live — seed runs BEFORE the
  read, first encounter anchors on its own candles; `ready` only,
  nearest to now-24h within ±2h, ties newer) vs the current merged
  price (`deriveOutrightVsLiveChange`). Candle-pure math stays as
  fallback (no-live-price/pending shape). Native-wins intact
  (non-null native = zero calls, zero seeds). Gaps → null everywhere.
- DOCTRINE: the two append-only comments (repository + entity) now
  read `append-only incl. one-time per-pool OHLC seed`; ATH needs no
  logic change (`findFdvAth` maxes over backfill + live as-is).
- SPECS (`address-snapshot-ohlcv-backfill.spec.ts`, 33): exact math
  on a VERBATIM 9-row STAGEVEIL subset (`.omo/evidence/
task-fe-ohlc-change-ohlcv.json` — the ticket's "IP: 23 velas"
  capture is not on disk, only referenced in the plan line; same
  newest≈24h-ago shape): seed-window + candle-time pins, fdv =
  close x supply, outright exact, idempotency (2nd encounter +0
  seeded), native precedence (0 calls, 0 seeds), 55h-gap null.
  Evidence: `.omo/evidence/task-fe-backfill24.log`.

## TOP-5 PROVIDER EXPLOITATION (todo 31, 2026-10-09)

Five legs over EXISTING providers (zero new vendors/keys). Rule for
all: each leg fires ONLY on the previous leg's null (common paths
cost exactly what they cost before), 404/absence stays null,
429/403 fail-open null (never throw except the 19b2
`RetryableProviderError` transient class, which still propagates to
the single-retry wrapper). Optional-method guards keep older hand
stub deps compiling (same precedent as the `getTokenPools` leg).

| #   | Provider                                    | New leg                                                            | Wiring                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Quota                                                                                     | Latency vs incumbent                                                                                                                               |
| --- | ------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | DexScreener (keyless, 60/min/endpoint)      | `search` fallback + `tokens/v1` fallback + `unichain` slug         | fetcher: strict → `search(address)` → `getTokensInfo(slug, address)`, all through shared `selectBestPairSummaryForSlug` (strict `chainId === slug` + best-liquidity) + todo-20 side check; `getTokensInfo` fixed to the live bare-array shape (was `{ pairs }`-only → null for every input, same dead-leg class as todo 18); slug map + fetcher + registry descriptor gain `unichain` (live: `search?q=unichain` → 2 `chainId: 'unichain'` rows)                                                                                     | worst case 3 calls/miss on ONE shared `outbound:dexscreener` bucket (hits still 1)        | strict-hit path unchanged; miss path trades ≤2 extra keyless calls for symbol-typed / thin-pair coverage the strict route misses                   |
| 2   | GeckoTerminal (keyless, ~10-30/min)         | `search/pools` + `tokens/multi` (≤30) + `simple/token_price` (≤30) | fetcher: info → multi (strict address match) → search (pool numbers only, identity stays null) on info-null; pools (existing) → simple-price on price-gap; `GECKO_SUPPORTED_CHAINS` UNCHANGED (optimism/unichain stay mapped-but-unqueried — catalog gates first)                                                                                                                                                                                                                                                                    | each fires only on null; multi/simple slice to 30 client-side                             | multi collapses batch fan-out ~30×; simple is the cheapest poll (no metadata overhead); search is the Gecko-only discovery leg (STAGEVEIL-pattern) |
| 3   | RugCheck (keyless, no published hard quota) | `search` fallback + `stats/new_tokens` feed                        | fetcher: summary hit unchanged (search NOT called); summary miss → `search(address)` exact-mint match contributes `holders` + `marketCapUsd` only (near-miss discarded); `getNewTokens` is feed-only (pre-warm input, NEVER called per-snapshot — quota discipline); blank queries return null zero-network                                                                                                                                                                                                                          | search only on summary-miss                                                               | discovery-race time: pending→ready on first touch for report-less mints                                                                            |
| 4   | Birdeye (keyed, CU-metered)                 | `supportsChains` 1→7 + `x-chain` + `token_security`                | `BIRDEYE_CHAIN_SLUGS` (1:1 for the 7 `STATIC_CHAINS` ids + `optimism` mapped-for-catalog-day; `unichain` DELIBERATELY unmapped — Birdeye lists no such chain); all 5 methods route through `resolveBirdeyeChain` (unmapped → null zero-network, never a wrong-`x-chain` query); fetcher + registry descriptor widen to `BIRDEYE_SUPPORTED_CHAINS`; `token_security` (25 CU) is service-only — NEVER in the fetcher (`SnapshotQuote` has no security columns; mapping it needs a snapshot-core change, out of scope)                  | 25 CU/security call — the spendiest Birdeye leg here; monitor via `GET /utils/v1/credits` | biggest chain-coverage delta in the matrix (EVM snapshots gain a second keyed leg where only Moralis/Mobula/CoinGecko served)                      |
| 5   | Mobula (keyed, demo rate-limited)           | `token/price` fallback + batch `POST token/price` (≤500)           | fetcher: markets hit byte-identical (price leg fires ONLY on its null) contributing price/mcap/fdv/liquidity/identity; literal path is `/token/price` (docs-page slug `token-price` is NOT the path; USD-suffix naming, unlike `token/markets` camelCase); batch posts `{ items }`, matches slots by echoed `address` (positional `error` slots dropped), caps 500 + drops unmapped-chain entries client-side; `CHAIN_MAP` UNCHANGED (robinhood/unichain/optimism unproven — demo 403s `token/price` on free, never invent coverage) | price leg 1 cheap call on miss path only; batch 1 call per ≤500                           | single-snapshot: cheap second chance instead of null; batch endpoints: 1 call replaces N× heavies                                                  |

Specs: `dexscreener-top5` (10), `geckoterminal-top5` (9),
`rugcheck-top5` (7), `birdeye-top5` (7), `mobula-top5` (7) — each
pins new behavior + no-regression (fallback legs NOT called on the
incumbent hit, via spies — the quota proof) + fail-open nulls.
Evidence: `.omo/evidence/task-fe-exploit-top5.log`.

## NEW PROVIDERS — DEFILLAMA + ETHERSCAN V2 (+ CONDITIONALS MEASURED) (todo 32, 2026-10-09)

Coverage-probe gate FIRST (keyless where possible, 8 chains:
ethereum/solana/bsc/base/arbitrum/polygon/optimism/unichain/robinhood;
evidence `.omo/evidence/task-fe-newprov.log`):

| Candidate                                                         | Probe                                                                                                                               | Verdict                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DeFiLlama `coins.llama.fi` `prices/current` (keyless, 0.63-0.79s) | 9-coin batch + per-token retests                                                                                                    | INCLUDE 7 chains (eth/sol/bsc/base/arb/poly/opt/uni — arb via USDC, poly via bridged-USDC); EXCLUDE `robinhood` (WETH-predeploy + STAGEVEIL both empty); per-token variance real (ARB/POL/WMATIC miss while siblings hit) → fallback-only |
| DeFiLlama `/chart/{coin}` (keyless, 0.61-0.64s)                   | WETH ±90d `start=`                                                                                                                  | WEAK (1-point coarse series both calls) → service method only, NEVER in the fan-out (ATH stays own-history, ATH-history rule below)                                                                                                       |
| Etherscan V2 (key REQUIRED)                                       | no-key `chainid=1 stats/ethprice` → `0/NOTOK/'Missing/Invalid API Key'` (shape pinned); NO key in shell or `.env` (names-only read) | IMPLEMENT-WITH-SKIP (skip-if-absent, zero network); 4663-on-free-key gate = `wontfix-documentado` (unverifiable keyless; free Robinhood/Arc window EXPIRES 2026-10-15 per docs, then Lite $49+ or re-verify)                              |
| Jupiter Price V3 (keyless-first, 0.5 RPS spacing)                 | `api.jup.ag` + `lite-api.jup.ag` wSOL → 200 both (1.07s/1.38s)                                                                      | BAKE-OFF then OUT (below) — Solana-only by design, needs no key today (`x-api-key` in docs, unenforced from this IP)                                                                                                                      |
| 1inch Spot Price                                                  | keyless `api.1inch.dev/price/v1.1/1/…` → 401 `Unauthorized`                                                                         | SKIP-DOCUMENTED (key-gated, no owner key; auth https://business.1inch.com/portal/documentation/apis/authentication, product https://business.1inch.com/products/price) — no bake possible, no code                                        |
| CoinPaprika (keyless)                                             | `tickers/eth-ethereum` 200 (price + `ath_price` 4946.22) + `search?q=CHALE` → 0 currencies                                          | OUT-DOCUMENTED (listed-only proven: no address→id path without a curated registry = invented coverage; and `SnapshotQuote` has no ATH column — wiring ATH needs a snapshot-core change, out of scope) — no code                           |

Bake-off (todo-28 method: distinct-address probes, ≥8s spacing, all
HTTP 200; fixtures JUP/wSOL/USDC-sol from the Jupiter docs — no memory
addresses; n=3 per leg, p50 = median; owner judges on the table):

| Leg                      | ms (n=3)              | p50    | Coverage class                                                |
| ------------------------ | --------------------- | ------ | ------------------------------------------------------------- |
| Jupiter Pro price        | 1.107 / 1.021 / 1.088 | 1.088s | Solana majors only (omits unreliable — quality, not coverage) |
| DexScreener token-pairs  | 0.705 / 0.713 / 0.685 | 0.705s | same majors + venue/liq (already wired, first)                |
| GeckoTerminal token-info | 0.870 / 0.728 / 0.748 | 0.748s | same majors + supplies/holders (already wired)                |

Verdict: Jupiter does NOT win (delta +383ms vs dex / +340ms vs gecko,
zero new token class — Solana majors already carry 5+ legs; Jupiter
also omits exactly the illiquid tokens incumbents miss, so marginal
coverage ≈ 0). OUT, re-open if heuristic corroboration is wanted.
1inch/CoinPaprika out/skip per the gate table (no bake possible).

Wired legs (both LAST — fallback-after-incumbents; merge is
first-non-null in order, so they only fill gaps; best-pick/venue
untouched — liquidity/venue never come from these legs):

- DeFiLlama (free, last-free): `prices/current` → `priceUsd` +
  mint-bound `symbol` ONLY (no mcap/fdv/liq on this surface);
  confidence floor 0.5 (probes 0.99); 1 call/scan; bucket 60/min.
- Etherscan V2 (keyed, last-overall): `tokenholdercount` → `holders`
  ONLY (PRO-gated: free-key nulls expected). `tokensupply` stays raw
  base units (never mapped to `totalSupply` — unit poison without
  decimals) and `getsourcecode` has no quote column — both
  service-level, documented, never in the fan-out. 1 call/scan;
  bucket 60/min; free 3/s + 100k/day + `Retry-After` cap per 19b2.
- ATH-history rule: NO ATH source changes in this lane (chart unwired,
  Mobula `token-ath` unwired in todo 31) — `fdvAth` stays own 90d
  history; any future ATH-source wiring must annotate or reset the
  window HERE first.
- Owner-keys checklist: `ETHERSCAN_API_KEY` (https://etherscan.io/apis;
  rotation extends the todo-27 cycle) · `JUPITER_API_KEY`
  (https://portal.jup.ag — only if Jupiter re-opens; keyless works
  today) · 1inch key (https://business.1inch.com/portal/registration —
  only if 1inch re-opens). Names only, never values, nowhere.

Specs: `defillama-newprov` (11: slugs, confidence, chart-max +
weakness pin, retryable) + `etherscan-newprov` (9: chainids incl.
4663, skip-if-absent, action pins, NOTOK-collapse, retryable) +
`provider-quote-newprov` (7: order-last, gap fills, incumbent-wins,
keyless-skip, QPS-math-as-test) + `cascade-order.spec` retargeted
(defillama last-free, etherscan last-overall).
Evidence: `.omo/evidence/task-fe-newprov.log`.

## HELIUS-KEYED ROUTING + 64-HEX FIX (todo 28, 2026-10-07)

- Helius via the correct seam (ONE env line, zero code): set
  `HELIUS_RPC_URL_MAINNET=<keyed URL>` and `SolanaRpcService`
  routes its primary path through it (`app.config.ts` maps the var
  to `solanaRpc.primaryRpcUrl`; the module wires it to
  `SOLANA_RPC_CONFIG`; `HELIUS_API_KEY` alone routes NOTHING).
  Solana-only (EVM tiers untouched). `HeliusService`
  (DAS/enhanced) is NEVER touched — shared with `dev-holdings` +
  backend `ticker-resolver`, out of blast radius. STATUS at lane
  time: var empty/absent (shell + PM2 `describe`, name-only read)
  → keyed routing PENDING-OWNER; all lanes below hold in
  public-only mode.
- Keyed-vs-public is LOUD at boot: `SolanaRpcService` ctor logs via
  `Logger.log` (not debug) `Solana RPC mode: keyed (primary
host=<hostname>, public fallback armed)` or `public-only
(HELIUS_RPC_URL_MAINNET unset — …)`. Hostname-only redaction
  (`redactRpcHost`): the keyed URL carries the key in path/query,
  so logs never carry more than the hostname. Every probe logs
  `solana-rpc <method> served-by=<primary|public>` (debug, same
  `served-by=` contract as the EVM `evm-rpc …` line) so quota
  decisions are made on data. 401/403/429 or quota-flavoured
  messages `warn` with the runbook pointer (never debug-silent);
  404 and plain transport errors stay quiet fail-open nulls.
- Helius free-tier math (pinned, numeric): ~10 rps effective on
  free. Hot-path budget: worst case 150 pool PDAs = 2 parallel
  `getMultipleAccounts` calls (≤100/chunk) per snapshot — noise
  against 10 rps; public fallback is 40 req/10s per IP rolling, a
  2-call burst is ~5% of that window. Plain JSON-RPC ONLY in this
  hot path (`getMultipleAccounts`/`getTokenSupply`/
  `getTokenLargestAccounts`/`getAccountInfo`) — NO DAS/enhanced
  methods here, ever.
- Robinhood 64-hex fix (`DirectFastPathService.resolveEvm`, the
  single seam): Uniswap V4 pools are named by bytes32 poolId (64
  hex), reported by DexScreener in `pairAddress`. The V2/V3 readers
  take that value as an `eth_call`/`eth_getCode` target → `-32602
(length 64, want 40)` on EVERY tier (verified shape from the
  p95 log). `isBytes32PoolId` guards first: 64-hex → fail-open
  `null` with a distinct debug line, ZERO reader calls (no tier
  walk). Full V4 routing (`getV4PoolView` + `encodeBytes32ArgCall`,
  both verified to exist) does NOT apply at this seam: it needs a
  verified StateView lens (`v4StateViewForChain`: ethereum/base
  only — robinhood has NO row) plus both leg decimals (discovery
  carries none). Follow-up (new todo): verify lens rows per chain
  - plumb decimals, then route. Audit of ALL other
    `ethCall`/`getCode`/`tryAggregate` writers (lane log): the only
    other callers are the reader internals (decoded 40-hex legs,
    constant lens — safe by construction) and the multicall fallback
    (fail-open `ok:false`); backend adapters excluded (other app).
    Pinned fixtures: `measurement-fixtures.spec.ts` (14 rows from
    `task-p95-measure.log`, never memory); re-measurement table:
    `.omo/evidence/task-fe-p95-quickwins.log`.

## TAIL PARALLEL + BREAKER + EVM-MISS SPANS (todo 29, 2026-10-07)

- Parallel tail (`AddressSnapshotService.buildSnapshot`): the three
  extras (launchpad / venue / dev-holdings) race under ONE shared
  budget — max `SNAPSHOT_TAIL_CONCURRENCY = 3` in flight (chunked
  `runTailCapped`; no p-limit-style helper exists in this app, so the
  10-line local IS the helper), 400ms per extra
  (`SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS`), degrade-to-null on timeout OR
  throw (timeouts named `tail:<extra>` in `providerErrors`, card never
  blocked). fdvAth stays SEQUENTIAL (indexed history read, no
  outbound; read-before-save is the todo-16 cold-start rule).
  Pre-resolved legs (fast-path serve) cost zero tasks. Both serve logs
  carry `tailMs=` + `breakerSkipped=`.
- Shared outbound math (pinned in `provider-outbound-limits.ts`):
  worst case ~10 outbound calls per cold snapshot (launchpad ≤4, venue
  ≤2, dev ≤3 solana-only), spread over tiers; each extra abandoned at
  400ms, never retried — bursts cannot stack past one 400ms window.
- Breaker — ONE way (19b3): the existing `CircuitBreakerService`
  (defaults: 5 consecutive failures → 30s cool-off) gates the fan-out
  (`canExecute === false` REMOVES the fetcher for that snapshot with an
  explicit skip note — fail-open, never throws). Registry
  `recordFailure` counters stay TELEMETRY-only (gateway `listStatus`),
  never a gate. Memory store + reset-on-deploy ACCEPTED (deploy wipes
  counts — flapping providers get a clean slate per deploy). Observed
  signal = THROWS only (timeout / outbound-deny / adapter errors);
  `'no data'` is conservatively ignored (an exhausted 19b2 retry
  collapses to the same `'no data'` as honest-empty — documented blind
  spot, no new taxonomy). Success = contributed OR ran-clean-without-
  contributing (aggregate-settled fanout only — fast-path in-flight
  fetchers are never prematurely blessed). Half-open = SINGLE cheapest
  probe (first half-open fetcher in policy order; the rest skip until
  the probe settles). Flapping = fixed cool-off re-open, no adaptive
  backoff. State metric: `breakerStates()` + transition logs
  (`breaker open` warn / `half-open probe admitted` + `breaker closed`
  log). Specs: open / close / half-open-single-probe / flapping /
  no-data-neutral / unknown-name-parity.
- EVM-miss spans (no new tracing lib): `DirectFastPathResult.timings`
  gains nullable `v2Ms` / `v3Ms` / `anchorMs` (per-family reads +
  native-anchor leg; Solana leaves them null by design); every EVM-miss
  leg logs ONE `direct-miss chain=… stage=… discoveryMs=… v2Ms=…
v3Ms=… anchorMs=…` debug line (stages: no-reader / no-discovery /
  side-mismatch / v4-poolId / aborted / no-priced-view). Tier
  attribution reuses the existing `evm-rpc served-by=` lines (same
  chain + address). Read-path rule: the three numbers get REPORTED
  before any read-path change (lane evidence log); inconclusive →
  document + leave the leg alone.
- STALE propagation: N/A (explicit). The tail changes WAIT time, not
  freshness semantics: extras were always nullable fail-open (slow =
  null, same as absent), `status`/`stale` trio + 19b1 floor untouched
  (stale replays still bypass the tail notes path identically —
  `providerErrors` rides along). No dexter / preview / UI contract
  change, so no marking through dexter→preview→UI. If a future lane
  makes an extra STALENESS-bearing (e.g. cached launchpad), that lane
  owns the 19b1-style marking.

## HELIUS HISTORY ORIGIN LEG (todo 36, 2026-10-10)

LAST-resort origin leg for graduated-old Solana mints (live curve
closed, PDA batch + heaven both miss — INCOME-pattern): the detector
resolves origin from on-chain HISTORY via the Helius seam
(`HeliusService.getAddressHistory` + `parseTransaction`; no raw
`getSignaturesForAddress` — the seam proves sufficient).

- ORDER (append-only, nothing reordered): PDA batch → heaven → Helius
  history on Solana; EVM never touches Helius (Solana Enhanced-API
  seam only — EVM all-miss stays null). Fast-leg hits return with
  ZERO Helius calls (spec-pinned via spy).
- SEQUENCE (exactly 2 calls/fire, zero retries in-leg): ONE history
  pull (`HELIUS_ORIGIN_HISTORY_LIMIT = 100`, the seam default) →
  slot-ascending earliest (Helius serves newest-first, so a literal
  limit-1 would return the NEWEST tx — useless for origin) → ONE
  full-tx fetch for that signature only. Window-honesty: the true
  genesis may lie deeper than the 100 newest (INCOME live: window
  450534185→453388576, earliest = generic ATA INITIALIZE_ACCOUNT,
  no known program) — pagination is a quota-expensive follow-up,
  deferred; the leg reports earliest-in-window, never genesis.
- MAPPING (program-id actors only, never name/symbol):
  `HELIUS_ORIGIN_PROGRAM_TO_LAUNCHPAD` (pump-fun / raydium-launchlab
  / moonit / boop / heaven / meteora-dbc program ids; first KNOWN
  instruction program in tx order wins) + fee-payer/first-signer vs
  `BELIEVE_DEPLOYERS` (empty today → never fires; the allowlist IS
  the leg, R1 Believe-mutability rule). Metadata renames make
  name/symbol keying a false-positive source — the mapper does not
  read those fields (grep-provable). Unknown actor → null, no
  guessing; `launchpadInfo` re-validates the id, so a stale key
  fails open.
- BUDGET (archival, intentionally over the brand deadline): env
  `LAUNCHPAD_HELIUS_ORIGIN_TIMEOUT_MS`, default 8000
  (`resolveHeliusOriginTimeoutMs`; non-finite/<=0 → default).
  Bounded by the outer 10s `DETECTOR_TIMEOUT_MS`; over-budget aborts
  to null (in-flight Helius calls are not cancellable — no
  AbortSignal on the seam — but capped at 2/fire by construction).
  The tail fails open on cold scans; the origin lands on a later
  pass. 429/timeout/empty-history/parse-null → null, fail-open.
- KEY (runtime-only, never printed/stored): `HeliusService` arrives
  via DI (`HeliusModule` import, `@Optional()` — hand-built specs
  without it stay byte-identical); the key lives in `HeliusConfig`
  (`HELIUS_API_KEY` env at runtime), which this leg never reads,
  logs, or persists. DI absent → null with zero network.
- QUOTA (why no cache, no throttle): ≤2 Enhanced-API calls per fire,
  and the leg fires ONLY for Solana mints where fast legs miss
  (closed/absent curves — a scan minority; live-curve tokens cost 0
  Helius calls). Noise vs the 300 req/min internal budget and the
  ~10rps free tier.
- LIVE STATUS: INCOME `7DyyqPAz5RZMiAu9e6h3ynbiREzbNu46gxpJNvimkYdX`
  NOT live-confirmed (history 200, full-tx 429-walled twice incl. a
  6s-backoff retry) → specs use LABELED-SYNTHETIC fixtures (file
  comment says so) + the real live-earliest shape (generic ATA,
  `signer` undefined → null, never guesses). Evidence:
  `.omo/evidence/task-fe-helius-origin.log`.

## COMPUTED FDV (todo 38, 2026-10-10)

Single-seam computed FDV at the merge exit (`buildSnapshot` in
`address-snapshot.service.ts` — the ONE place FDV is decided, both
serve paths converge there): `fdv = price×(total ?? max)` with guards
copied from `marketCapOf` (`direct-fast-path.service.ts:1013-1024`) +
`isSanePrice` (`:173-177`) + `toNumber` (fetchers) — both finite and

> 0, else `null`; never invented validation. `circulating` NEVER feeds
> FDV (MC input only — enforced by the helper taking no circ parameter).
> `total ?? max`: total wins (mint-disabled ⇒ total == max on fixed
> supply); max is the EVM-vested fallback (CoinGecko is the only fetcher
> carrying max/circ; gecko/solanaRpc/birdeye/mobula carry `total` only).
> Pure math lives in `snapshot/domain/snapshot-computed-fdv.ts`
> (spec-pinned epsilon invariant
> `|fdv − price×supply| ≤ max(1e-9×|…|, 1e-9)` on 4 fixtures:
> Solana-fixed, EVM-vested, null-supply→null, INCOME with supply field
> cited: total).

- MC COHERENCE (review finding): `marketCapUsd = price×circ`
  recomputed when `circ` present (no card shows MC > FDV unexplained);
  when `circ` absent the merged MC is kept (mint supply ~= circulating
  for most SPL mints, so MC≈FDV for fixed supply — same pattern as
  `marketCapOf :1017-1019`). Discarded provider-reporteds are
  debug-logged (`computed-fdv discarded …` / `recohered …` lines).
- PROVENANCE: new history rows carry `quote.fdvProvenance: 'computed'`
  (no migration — jsonb key; absent from `SNAPSHOT_QUOTE_FIELDS` so the
  merge never copies it, always assigned at the seam). `findFdvAth`
  still maxes `fdvUsd` (one computed semantics going forward); the 90d
  window is MIXED-transient (pre-seam provider rows age out via the
  janitor, no backfill — documented in the repository docstring).
- Fast-path Solana cards already compute `price×supply` via
  `marketCapOf` — the seam recomputes the identical value and tags it
  (no double semantics). EVM fast cards carry no supply → computed
  null, same as before. Best-pick ranking untouched (liquidity-first +
  FDV tiebreak re-verified green, no redesign).
- Evidence: INCOME `7Dyyq…vimkYdX` own price×total ≈ 2689 ≈ Rick 2.7K
  vs reported 3016 (fixture reproduces cited magnitudes; live NOT
  re-probed — fixtures carry the proof per the todo).

## FREE-TIER QUOTA STRATEGY (todo 40, 2026-10-10 — measurement-first, explicit no-op)

Verdict: NO CUTS. Every quota-pressure point is absorbed by existing gates;
every cut candidate either touches identity legs (EXCLUDED by name — metadata
fallback todo 39, launchpad/venue/fdvAth/best-pick, dev-holdings Helius leg) or
trades free serves for unmeasured savings. Full evidence:
`.omo/evidence/task-fe-free-quota.log`.

Measured characterization (M = measured in this repo, A = assumed/doc):

- Helius primary: intermittent HTTP 429, body `max usage reached`, headers
  Cloudflare-only (NO Retry-After, NO credit-remaining, NO X-RateLimit-\* — the
  header discriminator does not exist here). Isolated single probe → 429, yet
  `served-by=primary` lands minutes apart with 0×401/403 ever → key VALID.
  Treat as **0-reliable-capacity**: never build new legs assuming it, never
  remove it (free serves still land; shyft→public fallback absorbs all 429s).
  Headerless-429 is NON-retryable by construction
  (`retryable-provider.error.ts`), so the wrapper never hammers the wall.
- Chainstack: **0 capacity by credential** (401 `Access token missing or
invalid` on EVM + Solana; Platform Bearer ≠ node token — owner swap pending).
  Tier stays wired (serves automatically post-swap); NEVER hard-code a skip.
- dRPC: transport HEALTHY (`eth_chainId` → `0x1`, 200); 400 invalid-arg on
  V2/V3 reads with the SAME body failing on alchemy (-32602) + public (525) →
  SHAPE bug (caller params; one shared body per `alchemy.service.ts:162-167`),
  NOT quota. Excluded from quota kills.

Budget table (REAL ceilings; cold explicit-chain reference shape pinned by
`free-b-tiers.spec.ts:190-204` — Solana 4 RPC calls / EVM 6, ×2 retry cap):
DexScreener M-lenient (90-burst → 0×429) · GeckoTerminal M-wall ≈5/burst
(`retry-after: 0`; 60/min bucket does NOT mirror reality — fail-open absorbs) ·
Birdeye/Mobula/CoinGecko/CMC/RugCheck/Llama/Etherscan A-doc tiers, 60/min
buckets · ccxt 600/min (ohlcv cost 5) · Helius archival bounded (dev ≤1/fire
400ms tail; origin ≤2/fire 8s Solana-LAST) · Shyft M-healthy (cold-scan 4 ≤
20/s ✓) · public Solana A-40/10s · Alchemy M-healthy (8/8 nets) · dRPC
M-healthy. Retry worst case 2 req/miss (cap 2000ms + jitter); tail ≤10
calls/cold @400ms abandon; breaker 5 fails → 30s (registry counters
telemetry-only).

Staleness/refresh rules (UNCHANGEABLE without a quota todo): edge 30s TTL ·
SWR ≤24h + bit · history 90d janitor · discovery cache 30d + tripwire · PONS
7–30d · NO new cron/refresh loops.

## IDENTITY PROVENANCE (todo 39, 2026-10-10)

`identityProvenance: 'market' | 'metadata' | null` on `SnapshotQuote`
(assigned, never merged — absent from `SNAPSHOT_QUOTE_FIELDS` like
`fdvProvenance`; jsonb key on history rows, no migration). Market
legs first, metadata LAST: the fast path names from the side-verified
discovery pair and falls to `basics.metadata` only for unnamed
fields; the post-merge seam (`buildSnapshot`) keeps a fast-path pin
verbatim, else fills symbol/name from ONE lazy metadata read when the
merged quote names nothing (Solana token-kind only, own 2s budget
`METADATA_IDENTITY_BUDGET_MS`, fail-open; the healthy path pays zero
calls — quota note for todo 40: ≤3 RPC calls per identity-less
Solana snapshot only). Identity-ONLY fill (supply/holders/price stay
aggregator-owned — market-less hits keep `pending` with honest N/A
numbers). `isMutable` decoded from the metadata tail (creators-skip +
`primary`/`is_mutable` order per `mpl-token-metadata`
`state/metadata.rs`); mutable still resolves — the dexter marker is
mandatory for ALL metadata names (Believe rule: never verified
fact). Program constant verified against
`metaplex.com/docs/official-links` + live USDC metadata read
(owner + bytes match the repo fixture). Token-2022 scope:
program-agnostic PDA path (a 2022 mint WITH a metadata PDA resolves
identically, spec-pinned); extension-embedded names without a PDA
are OUT (mint-TLV parsing, no demand case, fail-open null). Compat
edge carries the field; the reduced batch surface does not (no
venue/launchpad/fdvAth there either — unchanged).

## FREE-SCALE: SINGLEFLIGHT + TTL POLICY + GOVERNOR (todo 41, 2026-10-11)

Invariant owner (2026-10-11): query volume grows unbounded; every data
method stays free-tier forever — scale by FEWER calls, never more quota.

HEADROOM MATH (M = measured in this repo, A = assumed/doc; per-COLD-scan
costs from the todo-40 reference shape + code reads; bare-sweep
multiplies per candidate chain — up to ~8 snapshots per bare address):

| Provider                   | Free ceiling + doc URL                                                                                                 | Cost / cold scan                                       | Max cold scans/min | 10x (20/min)           | 100x (200/min)                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------ | ---------------------- | ------------------------------------ |
| DexScreener keyless        | 60 req/min/endpoint, https://docs.dexscreener.com/api/reference                                                        | ~3 (M: strict + search + tokensInfo fallbacks)         | ~20                | AT ceiling             | shed (governor L2 + buckets + stale) |
| GeckoTerminal keyless      | ~10/min base (~30/min per-endpoint), https://api.geckoterminal.com/docs (M: 429 wall at ~5-burst, `task-fe-retry.log`) | ~3 (M: pools + search + conditional OHLC)              | ~3-10              | EXCEEDS 2-6x           | shed (stale replay + honest pending) |
| CoinGecko Demo keyed       | ~30/min, 10k credits/mo, https://docs.coingecko.com/reference/*                                                        | ~1 (A)                                                 | ~30                | ok                     | shed (Tier-2 off at L1)              |
| Birdeye keyed              | CU-metered, /defi/price 300 rps, https://docs.birdeye.so/reference/*                                                   | ~1-2 (A)                                               | key-plan           | ok                     | shed (Tier-2 off at L1)              |
| Etherscan V2 keyed         | 3/s free, https://docs.etherscan.io/etherscan-v2                                                                       | ~1-2 EVM holders (A)                                   | ~90                | ok                     | ok                                   |
| Alchemy keyed              | key plan, https://www.alchemy.com/docs/reference/api-overview (M: 8/8 chainIds healthy)                                | ~6 EVM RPC/scan, x2 retry cap (M: `free-b-tiers.spec`) | plan-bound         | ok                     | shed with tier                       |
| Shyft keyed                | 20/s RPC, Index 0 carved (M: getHealth ok 2026-10-09)                                                                  | ~4 Solana/scan (M)                                     | ~300               | ok                     | ok                                   |
| Helius                     | 0-reliable (M: headerless-429 wall, `task-fe-free-quota.log` §1a)                                                      | 0 capacity in math                                     | 0                  | n/a (fallback absorbs) | n/a                                  |
| Public Solana              | 40 req/10s/IP, https://solana.com/docs/rpc/http                                                                        | last tier (A)                                          | ~240               | ok                     | ok                                   |
| RugCheck/DeFiLlama keyless | no published hard quota (https://api.rugcheck.xyz/swagger/index.html)                                                  | ~1 (A)                                                 | unknown-bounded    | watch                  | watch                                |

Current load ~2 cold snapshots/min (M: operator-only cadence, probes
spaced ≥8s; 30s edge cache absorbs repeats at 0 quota). VERDICT
(declared per the todo's Tier-0 rule): Tier-0-alone (Gecko ~3-10/min,
Dex ~20/min) EXCEEDS at 10x current — the invariant is BOUNDED, not
hoped: sustained cold demand past ~10 MISS/min sheds Tier-2, past ~90
MISS/min serves Tier-0-only + stale replays (24h bound) + honest
pending. At 100x the asymptote is cache-mostly-stale + Tier-0-only
live legs; singleflight absorbs concurrent duplicates (N→1 upstream).

Mechanisms (all fail-open, all in `snapshot/`):

- `SingleflightService` (`snapshot/application/`): `Map<string,Promise>`
  - `try/finally` delete + cap 1000 LRU + own timeout (default 15s,
    `SNAPSHOT_SINGLEFLIGHT_TIMEOUT_MS`) rejecting adherents without
    poisoning (late leader success still warms the cache). Normalization
    IS `AddressIdVo` (the `snapshot:<chain>:<address>:<kind>` cache key —
    no new function). Interposed at the `getSnapshot` entry (the single
    choke point every edge/batch caller funnels through).
- `snapshot/domain/snapshot-ttl-policy.ts` (SINGLE source of truth,
  30s default preserved): numbers 30s (hot+edge writers) / identity
  history-bound, no TTL writer / venue-launchpad live-per-call + 30d
  tripwire-verified discovery cache (invalidated by tripwire mismatch /
  migration signal / operator override — never "immutable by mint") /
  holders-dev 30s card-only, NO hours-class without a signal trigger
  (rug/dev-dump moves in minutes). PENDING IS NEVER CACHED (19a
  absolute — no pending TTL exists on purpose). `snapshot-ttl-policy.
spec.ts` FAILS on any hardcoded TTL literal in a snapshot writer.
- Stale trio per class (ONE trio, class-scoped semantics — no new
  bits): on replay, numbers+identity+dev are stale (age `staleAgeMs`);
  venue/launchpad/fdvAth on the SAME card resolve live and stay fresh.
  `no-bit-without-age` is runtime-guarded (corrupt row → honest
  pending, never a bit with no age). Stale replays are never cached,
  never re-persisted.
- Tail-degraded (ONE decision, pinned): `AddressSnapshot.degraded`
  (true on any `tail:*` timeout, `dev:fast-path` skip, or
  `metadata-identity` timeout) travels edge → dexter → frontend
  `Partial data` badge. Degraded-ready IS cached with the bit set
  (30s — the bit IS the honesty); pending/stale never.
- `QuotaGovernorService` (the ONE governor, read in `getSnapshot`
  AFTER the cache check, BEFORE the fan-out; edges/batch check
  NOTHING): signal = own rolling MISS counter (outbound estimate) +
  breaker open-count + 429/quota-event metric from `providerErrors`
  (own `governor:*` notes + `tail:*` latency excluded — no feedback
  latch); actuator = tier-skip (L1 sheds Tier-2 keyed, L2 Tier-1+2 →
  Tier-0-only) + `providerErrors['governor:shed-tier-N']` audit note.
  Tier-0 is never shed (their walls are absorbed by buckets + retry
  cap + breaker + stale, pinned above). Thresholds pinned with env
  overrides (`GOVERNOR_L1/L2_*`); memory + reset-on-deploy ACCEPTED.
- Kill-list: NONE executed (every removal needs spec + live fixture +
  coverage class + owner sign — nothing met the bar; the governor
  sheds transiently at runtime with an audit trail, which is NOT a
  removal). Full evidence: `.omo/evidence/task-fe-free-scale.log`.

## GRADUATED PUMP.FUN ORIGIN: RUNBOOK + HELIUS DIAGNOSIS + SUFFIX TABLE (todo 48, 2026-10-16)

Precedence PINNED (cross-system, not "three vias in order"):
override (dexter `resolveLaunchpad`, curated row wins even over a
positive detection) > detector-positive (on-chain proof below) >
suffix-corroborated (SAME id + local `corroborated` flag, never a new
id) > null. SCRIP-pattern (graduated pump.fun, closed curve,
detector null) resolves via rank 1 until a leg proves otherwise.

- (a) RUNBOOK (SCRIP-instantiation of the EXISTING general flow —
  table `dexter_launchpad_overrides` + CRUD
  `POST/GET /api/dexter/launchpad-overrides` (+ `GET /:id`,
  `DELETE /:id`, NO `PATCH`) + docs already exist per plan: dexter
  AGENTS todo-37 section + `launchpad-overrides.controller.ts`;
  ZERO code in this lane). SCRIP mint (from todo-47 evidence
  `.omo/evidence/task-fe-supply-fallback.log`, live snapshot
  2026-10-16):
  `y95bhwzuuapjj9gebxfebuzzeccrvw6kqxkqczcpump` (symbol SCRIP,
  venue `pumpswap` = graduated pump.fun, suffix `...pump`
  present, detector `launchpad: null` per plan). Dev dexter
  `:4060`. DTO is camelCase (`mint`, `launchpadId`, `note`) —
  snake_case `launchpad_id` 400s (proven 2026-10-10). Baseline:
  `curl -s 'localhost:4060/api/dexter/launchpad-overrides?mint=
y95bhwzuuapjj9gebxfebuzzeccrvw6kqxkqczcpump'` -> `[]` + preview
  `POST /api/dexter/templates/preview {draft:{command:'ca',
bodyMarkdown:'{{launchpadIconLink}}'},address:'y95bhwzuuapjj9g
ebxfebuzzeccrvw6kqxkqczcpump'}` -> text `""` (launchpad null).
  Set: `curl -s -X POST localhost:4060/api/dexter/launchpad-
overrides -H 'Content-Type: application/json' -d '{"mint":
"y95bhwzuuapjj9gebxfebuzzeccrvw6kqxkqczcpump","launchpadId":
"pump-fun","note":"todo-48 SCRIP graduated pump.fun (closed
curve, detector null, venue pumpswap); curated <YYYY-MM-DD>"}'`
  -> 201 `{id, mint, launchpadId:'pump-fun', ...}`. Verify:
  `GET ...?mint=y95bhwzuuapjj9gebxfebuzzeccrvw6kqxkqczcpump` ->
  `[row]` + preview ->
  `"[💊](https://pump.fun/coin/y95bhwzuuapjj9gebxfebuzzeccrvw6kq
xkqczcpump)"` (DisplayMap `launchpad/pump-fun=💊` pre-exists
  since 2026-10-10; if absent, IconLink falls back to `Link` per
  renderer contract). Revert: `DELETE
/api/dexter/launchpad-overrides/<id>` -> 204 + `GET ...?mint=`
  -> `[]` + preview -> `""` (revert proof). CLEANUP RECEIPT (this
  lane): NO live contact performed (boots are out of scope for
  this lane) -> zero rows created -> nothing to revert
  (reverted-N/A, never touched).
- (b) HELIUS DIAGNOSIS (code-reading + precedent numbers;
  re-implementing the leg is FORBIDDEN — the leg is untouched).
  `detectHeliusOrigin` (last Solana resort, after PDA batch +
  heaven; EVM never touches it) misses a SCRIP-pattern token BY
  DESIGN via exactly two modes. M1 window-honesty: history is
  newest-first with `HELIUS_ORIGIN_HISTORY_LIMIT = 100`, so the
  leg reports earliest-IN-WINDOW, never genesis — genesis deeper
  than the 100 newest (any active/old graduate) yields a generic
  earliest (swaps/ATA) with no known program -> mapper null.
  Precedent numbers (INCOME live 2026-10-10): window slots
  450534185->453388576 (2,854,391 slots over 100 txs), earliest =
  generic ATA INITIALIZE_ACCOUNT (ComputeBudget + Associated-Token
  programs only, `signer` undefined) -> null, correctly. Threshold:
  genesis-depth > 100 txs -> miss GUARANTEED (units: transactions).
  M2 429-wall: EXACTLY 2 Enhanced-API calls/fire, ZERO in-leg
  retries — any 429/timeout/parse-null on either call -> null.
  Precedent numbers: INCOME full-tx fetch 429-walled TWICE (incl. a
  6s-backoff retry). Threshold: 429 count > 0 per fire -> null
  (units: HTTP 429 responses; retry budget 0). SCRIP-grounding
  (todo-47 live snapshot): SCRIP is ACTIVE (price 3.171e-6 +
  `pumpswap` venue + DexScreener pair) — its 100-tx newest-first
  window is dominated by recent swaps, so its pump.fun genesis
  (creation ix, graduation long past) lies with certainty deeper
  than the 100 newest -> M1 miss GUARANTEED by construction for
  this mint (threshold genesis-depth > 100 txs applies directly).
  Metric to watch: `parseTransaction` 429 rate per fire + window
  slot-span per `getAddressHistory` call. OWNER-GATED PROBE (exact
  command, NOT run by this lane — no live calls here): with
  `HELIUS_API_KEY` in env (never printed), `curl -s -X POST
<helius-rpc> -H 'Content-Type: application/json' -d
'{"jsonrpc":"2.0","id":1, "method":"getSignaturesForAddress",
"params":["y95bhwzuuapjj9gebxfebuzzeccrvw6kqxkqczcpump",
{"limit":100}]}'` -> inspect slot span + oldest entry; then ONE
  `getTransaction` for the oldest signature -> check instruction
  program ids against `HELIUS_ORIGIN_PROGRAM_TO_LAUNCHPAD`. Oldest
  parses clean but unknown -> M1 (works-as-designed, deeper than
  window); oldest fetch 429s -> M2 (works-as-designed, zero-retry
  policy). VERDICT: re-implementation question closed
  `wontfix-medido` — the leg behaves as specified (INCOME numbers
  above + SCRIP M1-guaranteed by its active-graduate shape);
  SCRIP-window numbers await the pinned probe, which can only
  confirm M1/M2, never indict the leg.
- (c) SUFFIX TABLE (`...pump` corroborating, never decisive — R1
  `.omo/plans/dexter-launchpad.md:57`: "NO heuristica del sufijo
  `...pump` como unica fuente"). Executable table:
  `src/launchpad/domain/pump-suffix-corroboration.ts`
  (`hasPumpSuffix` case-sensitive + `corroboratePumpSuffix` pure).
  Venue x detector x suffix -> origin: venue NEVER participates
  (origin != venue); detector `pump-fun` + suffix -> `pump-fun`
  (+`corroborated:true`); detector `pump-fun` w/o suffix ->
  `pump-fun`; detector other-id (+/- suffix) -> other id (never
  re-keyed); detector null + suffix -> NULL (mandatory falsifier);
  detector null w/o suffix -> null. R1 allows AT MOST a documented
  fast-path after PDA — this lane implements LESS (observe-only
  annotation, zero path change). SEAM pinned: `detectInner` Solana
  branch calls the table AFTER the full verdict; returns it
  UNCHANGED (only observable: `debug` log lines). RENDERER decided:
  mismo-null — NO marked low-confidence value exists (suffix-alone
  renders the existing `""` x4; corroborated renders
  byte-identical to uncorroborated). PROVENANCE decided:
  silent-with-reason — NO new wire field (`corroborated` is local
  to the seam log; end-to-end churn for zero display delta
  rejected); invariant `corroborated=false` whenever `id=null`
  (no-bit-without-value, spec-pinned). Specs (12):
  `launchpad-detector-pump-suffix.spec.ts` (table + falsifier +
  detector-level falsifier + seam identity). Evidence:
  `.omo/evidence/task-fe-graduated-origin.log`.

## SUPPLY TRANSPORT (todo 47, 2026-10-16)

Gate case SCRIP (`y95bhwzuu…pump`, solana): `sources: ['dexscreener']`,
supply triple-null → FDV N/A, with `solana-rpc/coingecko/birdeye/mobula:
no data` (on-chain leg 429-walled on public tiers + indexed-gating, NOT
absence; CoinGecko 404s the mint itself; Gecko `/info` 404 + `/multi`
empty + pool-search hit carries price/fdv only — pools have no total
supply). Gate verdict: 429/timeout-RPC on the on-chain leg +
todos-los-legs-null elsewhere. Evidence:
`.omo/evidence/task-fe-supply-fallback.log`.

- DISCARD REPAIRED (the one code-proven break in the five-leg fan-out):
  `CoinGeckoService.getTokenContractInfo` null-collapsed when price AND
  mcap were both null, dropping already-fetched
  `total/circulating/max` for long-tail tokens CoinGecko tracks without
  pricing. Now null-collapses ONLY when every mapped field is null
  (price+mcap+fdv+volume+change+total+circ+max); supply-only rows ride
  the existing fetcher mapping into the first-non-null merge, where the
  todo-38 seam seals `fdv = price×(total ?? max)` (invariant untouched).
  The other four legs audited clean (Gecko passes `total_supply`
  through; Birdeye/Mobula map verbatim; solanaRpc fails transport-only).
  Fetcher order + fan-out shape + retry + merge UNCHANGED (reorder would
  silently change multi-hit winners).
- QUOTA: zero new calls (same single GET, same retry, same keyless skip)
  — calls/scan delta 0 on every path, no QPS-math delta.
- EVM CHAIN (verbatim): Birdeye→Gecko→CoinGecko→null (the on-chain leg
  is Solana-only — no EVM `getTokenSupply` equivalent exists in the
  fan-out, so EVM supply depends on aggregator legs alone).
- MINT-AUTHORITY ASSUMPTION: on-chain `getTokenSupply` reads
  current-minted, which ≡ total supply under disabled mint authority —
  valid scope pump.fun fixed-supply (graduated mints are renounced;
  outside that scope a re-mintable token would under-report).
- Specs: `coingecko-supply-transport.spec.ts` (supply-only transports,
  price-only/full byte-identical, all-null still null, keyless skip,
  fetcher end-to-end + order pinned).

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

- Pending semantics + no-negative-cache (dexter plan todo 19a,
  robust-nulls S): `status: 'pending'` means every provider failed or
  yielded nothing — a TRANSIENT shell, not a verdict. Pending
  snapshots are NEVER cached at any of the three writers (service
  `AddressSnapshotService` skips `cache.set`; edge `CacheInterceptor`
  skips `status: 'pending'` bodies; batch `getOrSet` takes a
  `shouldCache` gate the controller sets to "not pending"), so the
  P12 repeat re-touches providers (`x-cache: MISS`) instead of
  serving a frozen HIT. History still persists pending rows (19b SWR
  - fdvAth read them). `SnapshotNullMetricsService` counts the miss
    flavor (`no-market`: every error is `'no data'`; `transient`: any
    throw/timeout/outbound-deny; `cached`: a pre-deploy pending row
    served from cache — must decay to 0 past deploy+60s). Metric only:
    no cron, no periodic scan. Runbook: rising `transient` on canary
    tokens (WIF/SOL) → check `providerErrors`; nonzero `cached` past
    deploy+60s → a writer regressed → check the three sites above.

- Single retry with cap + jitter (dexter plan todo 19b2, NO breaker —
  that is 19b3): per-fetcher wrapper `applySingleRetryFetchers`
  (`provider/infrastructure/quote-fetchers/fetcher-retry.ts`), wired in
  `AddressSnapshotService` OUTSIDE the outbound gate (policy → retry →
  gate → aggregate). Retries EXACTLY ONCE, ONLY on timeout
  (`ECONNABORTED`/`ETIMEDOUT`) / 429 WITH a parseable `Retry-After`
  header / 5xx — surfaced by adapters as `RetryableProviderError`
  (`provider/domain/retryable-provider.error.ts`); 404 and everything
  else stay `null` and are NEVER retried. Delay
  `min(Retry-After, 2000ms)` + full jitter (`capped + random*capped`;
  `Retry-After: 120s` waits ~2–4s, never 120s). Same-bucket math: every
  attempt runs the GATED fetch, so one miss costs at most 2 × cost
  tokens from the SAME `outbound:<name>` bucket (budgets in
  `provider-outbound-limits.ts` + `provider-descriptor.ts`, unchanged
  — no phantom budget). Second failure → `null` fail-open (merge
  byte-identical to a miss; exhausted retries debug-log as the signal
  19b3 observes). Excluded by design: `solana-rpc` (own
  primary→public fallback loop, never throws), `ccxt` (opaque lib
  errors, no axios taxonomy). Evidence: REAL 429 loop captured live
  2026-10-07 (GeckoTerminal: 5×200 then 35×429 with `retry-after: 0` +
  JSON error body; our 60/min bucket does NOT mirror their ~5/burst
  throttle) — `.omo/evidence/task-fe-retry.log`.

- Serve-stale floor, NO background refresh (dexter plan todo 19b1,
  SWR without the R): when the live fan-out fails,
  `AddressSnapshotService` replays the newest `ready` history row
  from `SnapshotHistoryRepository.findLatestReady(key, kind,
maxAgeMs)` — exact stored-key (`AddressIdVo.key` =
  `chain:address`, NOT the `snapshot:<chain>:<addr>:<kind>` service
  cache key) equality + `status='ready'` + `ORDER BY createdAt DESC
LIMIT 1`, riding the existing `(key, createdAt)` BTREE (no
  composite migration: `(chain,address)` is never queried).
  Max-age bound 24h default (`SNAPSHOT_STALE_MAX_AGE_MS`;
  `SNAPSHOT_STALE_MAX_AGE_HOURS` override, `resolveStaleMaxAgeMs`
  pinned with default fallback) — over-bound rows and pendings-only
  histories answer honest `pending`. The replay carries `status:
'ready'` (no new status value) + `stale: true` + `staleAsOf`
  (row ISO) + `staleAgeMs` (fresh: explicit `stale: false`, nulls);
  the trio travels on the compat edge, batch items, and the full
  snapshot. Stale replays are never cached (service skip, edge
  `CacheInterceptor` skip, batch `shouldCache` gate) and never
  re-persisted (the bound window never re-anchors) — the next
  request retries providers naturally. No cron/queue/setInterval/
  fire-and-forget exists anywhere on this path (stampede +
  unhandled-rejection classes absent by construction). No retry
  (19b2) / breaker (19b3) on this path — disjoint lanes/files.

- Free-B providers behind ChainRpc (dexter plan todo 30a):
  `AlchemyService.rpcCallForChain` tiers Alchemy → dRPC → Chainstack
  (`CHAINSTACK_API_KEY`, hosts in `CHAINSTACK_EVM_HOSTS`; `*`-rows
  convention-extrapolated, robinhood/avalanche have no row and skip)
  → public; `SolanaRpcService` tiers Helius primary → Shyft
  (`SHYFT_API_KEY`, Solana-only `https://rpc.shyft.to/?api_key=`)
  → Chainstack (`https://solana-mainnet.core.chainstack.com/`)
  → public, as `{name,url}` tiers for `served-by=` labels.
  Per-method carve-outs: free-B tiers never serve index/holders legs
  (`isFreeBTierSkippedMethod`: `getTokenLargestAccounts`,
  `getProgramAccounts`; Shyft Index 0/s, holders excluded, Chainstack
  Solana 5 RPS). Skip-if-absent is the dRPC-copy (empty key ⇒ tier
  skipped with a debug log — no kill-switch, no new env surface
  beyond the two keys). `launchpad-detector receiptTo` EXCLUDED by
  design (keyless single-shot receipt path, no ChainRpc dep, detector
  logic frozen — grep `receiptTo` stays keyless). Moralis-nodes =
  wontfix-documented (no `moralisNodesRpcUrl` export; Speedy sunset,
  no verified free node shape; value flows via the Data API; owner
  probe recipe pinned in `alchemy.chains.ts`). QPS-math lives as a
  test (`free-b-tiers.spec.ts`): reference shape `cold
explicit-chain snapshot` (Solana 2 legs / EVM ≤3 reads, ×2 retry
  cap; bare-sweep fans out per candidate chain — multiplied, not
  hidden). Owner-keys lane: implement-with-skips (≥1 leg live keyed
  per provider where a key exists, else skip+report; never demand
  unconditional live proof).

- Public-RPC rotation per chain (dexter plan todo 42, gratis para
  siempre): the public tier is ONE rotating position per stack —
  `AlchemyService.rpcCallForChain` reads `PUBLIC_EVM_RPC_URLS`
  (`alchemy.chains.ts`), `SolanaRpcService` reads `PUBLIC_SOLANA_RPCS`
  — AFTER keyed tiers (order pinned, untouched) and BEFORE honest
  null. Rotation table (every URL answered a live probe with the exact
  chain id / `ok` on 2026-10-12, evidence
  `.omo/evidence/task-fe-rotation.log`):
  ethereum ×3 (`ethereum.publicnode.com`, `cloudflare-eth.com`,
  `1rpc.io/eth`), base ×3 (`mainnet.base.org`,
  `base.publicnode.com`, `1rpc.io/base`), bsc ×3
  (`bsc-dataseed.binance.org`, `bsc.publicnode.com`, `1rpc.io/bnb`),
  arbitrum ×3 (`arb1.arbitrum.io/rpc`,
  `arbitrum-one.publicnode.com`, `1rpc.io/arb`), polygon ×2
  (`polygon-bor.publicnode.com`, `1rpc.io/matic`), optimism ×3
  (`mainnet.optimism.io`, `optimism.publicnode.com`, `1rpc.io/op`),
  robinhood ×1 (`rpc.mainnet.chain.robinhood.com` — the only public
  endpoint in existence), unichain ×3 (`mainnet.unichain.org`,
  `unichain.publicnode.com`, `1rpc.io/unichain` — NEW coverage, the
  public leg was null), avalanche ×3 (`api.avax.network/ext/bc/C/rpc`,
  `avalanche.publicnode.com`, `1rpc.io/avax/c`), Solana ×3
  (`api.mainnet.solana.com`, `api.mainnet-beta.solana.com`,
  `solana.publicnode.com`). Excluded with reason (probed, not
  assumed): `eth/polygon/optimism.llamarpc.com` (525/empty at probe
  time), `polygon-rpc.com` (403 tenant-disabled — key-gated now),
  `rpc.ankr.com/*` (key-gated everywhere). Policy (pinned, no env):
  round-robin cursor + latency EMA (alpha 0.3, 10% relax-to-best per
  read) + 5m backoff on 429/timeout (`PUBLIC_RPC_BACKOFF_MINUTES = 5`,
  lazy re-admit, no timers); scores/backoffs in-memory, reset-on-deploy
  (same rule as breaker/governor). Seams (no new metrics, no parallel
  loop): `served-by=public:<host>` on success; backoff enter/exit as
  `providerErrors['public-rotation:<host>']` notes via `drainRotationNotes()`
  (EVM: service → reader passthrough → fastPath; Solana: service →
  fastPath; merged at the `providerErrors` assembly) — 429-flavored
  enters feed the governor's existing pressure scan, exits are neutral.
  Primitive: `provider/infrastructure/rpc-rotation/public-rpc-rotator.ts`
  (+ specs: order/backoff/re-admit/decay/reset, service rotation +
  keyed-intact, snapshot note-merge). QPS delta: healthy path still 1
  public attempt; worst case ≤ listed endpoints, first success wins
  (bounded fan-out, spec-pinned — no retry loop).

- Kill-list re-audit with fresh eyes (dexter plan todo 43, 2026-10-12,
  `no-hay-grasa` with evidence — zero legs cut, zero `.ts` changed):
  every same-data-via-2-routes pair re-measured on the rotated
  substrate (fresh probes P1-P6 in
  `.omo/evidence/task-fe-kill-reaudit.log`, NOT old logs; live
  `served-by=public:*`/rotation-note traffic not yet observable —
  no restart permitted — so the note-merge channel stands spec-pinned
  (`address-snapshot-rotation.spec.ts` green) and `.logs` `served-by=`
  (38× shyft + 3× primary, pre-restart window) is cited only as
  tier-order context, never as rotation proof). Baseline legs:
  public-tier 0.37-0.47s single-attempt healthy (P1-P3);
  dex-search fallback 0.33s cheap-null (P4); defillama 0.79s (P5,
  matches 0.63-0.79s todo-32 probes); rugcheck-search 2.85s
  conditional-only (P6); discovery 640-978ms saved by cache (todo
  30b); tail extras 400ms abandon; retry cap 1 + ≤2s + jitter;
  breaker 5 fails → 30s. Decision per pair (criterion pinned:
  latency-measured + coverage-class + quota-cost, in that order;
  cut requires a no-regression spec — none met it):
  dex-strict/search/tokensInfo QUEDA (fallbacks fire ONLY on
  strict-null, happy path 0 extra; search = symbol-typed/thin-pair,
  tokensInfo = rows the search index skips; keyless 60/min);
  gecko-info/multi/simple/searchPools/pools QUEDA (all conditional;
  searchPools = Gecko-only class STAGEVEIL FDV $3471
  `sources:[geckoterminal]`, spec-pinned, live-proven 2026-10-06 —
  no Gecko live re-probe by wall discipline);
  mobula-markets/price QUEDA (price leg ONLY on markets-null, keyed
  60/min bucket); rugcheck-summary/search QUEDA (summary =
  locked/burned UNIQUE, no other leg; search exact-mint-only);
  defillama QUEDA (price+symbol ONLY, LAST free leg, 6 chains);
  etherscan-holdercount QUEDA (zero-network without key,
  spec-pinned; 1 call/EVM-scan with key, PRO-gated null on free —
  exact-count class + future-PRO depth); birdeye-EVM QUEDA
  (multichain fixture class, 7 chains incl. robinhood, CU-metered
  last-widen order); coingecko QUEDA (SOLE max/circulating supply
  source); solanaRpc-supply/top10 QUEDA (on-chain ground truth, no
  key); ccxt QUEDA (`covers()` CEX-only, zero onchain calls);
  direct-fast-path vs aggregator QUEDA (fast <200ms vs full card —
  latency architecture, resolver-adjacent, untouched);
  public-rotation siblings QUEDA (healthy = exactly 1 attempt;
  redundancy IS the feature); discovery-cache QUEDA (the saver,
  not the fat); ohlc-derived-change QUEDA (ONLY when all natives
  null, PONYO-class, null-honest otherwise); computed-fdv QUEDA
  (single-seam invariant, todo 38 — one exit, not two legs).
  Excluded by name (never candidates): identity-39 (metadata
  PDA/decode, hasIdentity, basics.metadata), launchpad (detector
  all legs, Helius-origin, override table, Pons), venue
  (snapshot-venue/resolveVenue), ath (findFdvAth/fdvAthUsd/At),
  Chainstack tier (owner credential swap pending), todo-40 legs
  (Helius-primary/dRPC-shape — litigated, NO re-abre per todo 43),
  detector/resolver/dexter/frontend/backend/gateway/workflows/
  `.kiro`/migrations/DB (untouched). Kill-list anterior stays
  closed. CHANGELOG skipped (no code — todo-40 precedent).

- Discovery cache with migration invalidation (dexter plan todo 30b):
  `DiscoveryCacheService.resolveDiscovery(chain, mint)` (snapshot/
  application) is the cache-first discovery seam: DB row
  `(chain,mint)→{pairAddress,dexId}` (`discovery_cache` table +
  `1774000000000-CreateDiscoveryCache` migration; in-memory map when
  DB-less) verified by the pinned tripwire
  `DexScreenerService.getPairByAddress(chainId, pairAddress)`
  (exactly 1 HTTP, never re-discovery). Hit + `dexId` match serves a
  summary built from the live tripwire pair (numbers are tripwire-
  fresh, never cached) with ZERO `token-pairs` calls; miss,
  tripwire-mismatch, null-tripwire (dead pair and transient error are
  indistinguishable — fail-open to re-discovery), or absent tripwire
  method (partial hand-mocks) re-discovers via strict
  `getBestPairSummaryForChain` and re-pins (null discoveries are
  NEVER pinned — honest empty re-probes, same rule as 19a).
  Invalidation: (i) tripwire mismatch, (ii) on-chain `migrated:true`
  (DBC-confirmed graduation curve→pool: the Solana fast path calls
  `invalidateDiscovery(chain,mint)` — the resolve→delete seam — and
  the next scan re-discovers + re-pins, promote-once; EVM legs have
  no migrated signal and are backstopped by the tripwire),
  (iii) 30d lazy TTL checked on every read (`find` deletes + misses
  past the bound; `DiscoveryCacheJanitorService` prunes unread rows
  — same constant, no cron). RETENTION CONTRAST (pinned): discovery
  30d (`DISCOVERY_CACHE_TTL_DAYS`) vs history 90d
  (`SNAPSHOT_HISTORY_RETENTION_DAYS=90`) — discovery rots faster.
  SEPARATION (pinned): cached `dexId` is venue vocabulary and NEVER
  flows into `launchpad.id` (origin vocabulary, `launchpad-info.ts`)
  — separate tables/seams, spec-asserted. Consumers: fast-path
  Solana/EVM discovery, `resolveVenue`, and the dexscreener quote
  fetcher (optional structural dep, direct fallback — tier/transport
  logic untouched). Specs: `discovery-cache.service.spec.ts`
  (2nd-scan zero-calls + tripwire-once + mismatch + null-tripwire +
  empty-miss + unmapped + pump→pool + separation + partial-surface),
  `discovery-cache.repository.spec.ts` (TTL/janitor primitives),
  `discovery-cache-janitor.service.spec.ts` (30d vs 90d).
