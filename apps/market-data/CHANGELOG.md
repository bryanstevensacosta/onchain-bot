# Changelog

All notable changes to `@onchain-bot/market-data` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Birdeye WS realtime as the stream/ DEX source:** new
  `BirdeyeWsAdapter` in `src/provider/infrastructure/birdeye/`
  (`birdeye-ws.client.ts` + `birdeye-ws.types.ts`) speaking the
  documented protocol verbatim over
  `wss://public-api.birdeye.so/socket/solana` (`echo-protocol`):
  combined `SUBSCRIBE_PRICE` (1m/usd) + `SUBSCRIBE_TXS` per type
  (gateway overwrites one sub per type, so the full mint list is
  resent on every watch change) + `SUBSCRIBE_NEW_PAIR` per handshake;
  `PRICE_DATA` routes to broker-shaped ticker/ohlcv events
  (`symbol` carries the mint verbatim), keyless `connect()` fails
  loudly, server close fans out `EXCHANGE_DOWN` (backoff + re-watch
  stay in `ExchangeConnectionManager`). `DefaultExchangeAdapterFactory`
  builds it for `exchange: 'birdeye'` (key from `BIRDEYE_API_KEY`;
  allowlist via `MARKET_DATA_STREAM_EXCHANGES`). Failing-first:
  `birdeye-ws.client.spec.ts` (mock socket, +1 suite / +6 tests).
  Live `:4000`-adjacent QA (evidence `.omo/evidence/birdeye-ws.log`):
  handshake accepted, zero error frames, adversarial drop ->
  EXCHANGE_DOWN + resubscribe-on-reconnect; market pushes are
  Premium-gated on this key, so the mocked suite stays the gate.
  (feat/mega-refactor-tramos)

### Fixed

- **Provider API keys wired through app config:** every keyed adapter
  module reads `cs.get('app.<name>')` but `app.config.ts` defined no
  such namespaces (and `AppModule` never loaded the config), so every
  adapter booted with `apiKey: ''` and returned null despite keys in
  `.env`. `buildAppConfig` now maps `ALCHEMY/BIRDEYE/COINGECKO/
COINMARKETCAP/MORALIS/MOBULA/HELIUS/PUMPDEV/FLUXRPC_API_KEY` +
  `HELIUS_RPC_URL_{MAINNET,DEVNET}` + `PUMPDEV_WALLET_{PUBLIC,PRIVATE}`
  - `FLUXRPC_{RPC,WS}` into the `app.*` namespaces (empty = preserved
    skip-without-key, never throws); `AppModule` adds `load: [appConfig]`;
    `SolanaRpcModule` resolves `primaryRpcUrl` from `app.solanaRpc`
    (Helius URL, public-RPC fallback otherwise). `.env.example` +
    staging/prod templates document the keys (placeholders only, never
    values). Failing-first: `app.config.spec.ts` (keys flow from mocked
    env + empty defaults) + `birdeye-config-wire.spec.ts` (module
    resolves the key from `app.birdeye`, empty fallback). Verified: 65
    suites / 252 tests green, `tsc --noEmit` clean, live boot with the
    local `.env` keys (8/9 providers initialized; FluxRPC correctly warns
    without `FLUXRPC_RPC`) — JUP/solana snapshot gains `coingecko` in
    sources with zero keyed `no data` quote errors, vs the keyless
    counterfactual (`birdeye`/`coingecko`/`mobula` `no data`, no keyed
    sources). Missing keys stay null-safe (`ready`, no crash).
    (feat/mega-refactor-tramos)

### Added

- **Solana RPC free supplies + top holders (coverage-expand):** new
  `SolanaRpcService.getTokenSupply` (`getTokenSupply` RPC — total
  only, no max/circulating leg exists on-chain) wired with the
  existing `getTokenLargestAccounts` as the `solana-rpc` quote
  fetcher (`supportsChains: ['solana']`, tier `free`, order
  geckoterminal -> solana-rpc -> rugcheck; `SnapshotModule` factory
  injects `SolanaRpcService`). Maps `totalSupply` (uiAmount, with
  amount/decimals fallback) + `top10HolderPercent` (top-10 uiAmount
  share of the on-chain total); RPC down/throw -> null, never throws.
  No key needed (public JSON-RPC). Failing-first:
  `provider-quote-fetchers-solana-rpc.spec.ts` (tier/meta, supply
  map, top10 math, null-down, throw-down, merge fill);
  `cascade-order` (9-fetcher pin) + `zero-cost` + `supply` stubs
  updated. Verified: 64 suites / 248 tests green, `tsc --noEmit`
  clean, live keyless `:4161` (JUP/solana 9/17 -> 10/17 with
  `solana-rpc` in sources; public RPC throttles largest-accounts
  with sustained 429 so top10 stays null live — unit-pinned, Helius
  primary resolves it; 小股东/bsc unchanged 9/17, SECT never probed).
  (feat/mega-refactor-tramos)

### Changed

- **Final `src/` restructure (R1, no behavior change):** chain lives
  inside address (`src/address/chain/` — catalog + probers; `chain/*`
  alias retargeted, `src/chain/*.ts` stay as deprecated re-exports) +
  NEW `src/aggregators/` (`AggregatorsModule`: merge moved verbatim
  from snapshot/, failover order data moved from provider/, NEW
  `AggregationPolicyPort` with a ccxt-first/quota-aware default —
  empty quota/credits is the identity, so the cascade order is
  unchanged) + fetchers moved to
  `provider/infrastructure/quote-fetchers/` + snapshot is history-only
  (`SnapshotModule` imports `AggregatorsModule`; the orchestrator runs
  resolve -> cache-first -> policy order -> token-bucket fetch ->
  merge -> history persist -> cache set) + cache/rate-limiter moved to
  `shared/infrastructure/` (aliases retargeted, old roots are
  deprecated shims) + holders resolves through the NEW
  `DevHoldingsPort` (`useExisting` binding, runtime-identical). Moved
  with `git mv`; every old path stays as a `@deprecated` compat
  re-export (removal at cutover, todo 8). Verified: 62 suites / 238
  tests green (61 pre-existing suites byte-identical + 1 NEW
  failing-first policy spec), `tsc --noEmit` clean, `nest build`
  clean, live boot route-diff identical (status codes + response key
  sets + provider order; snapshot values differ only by live provider
  variance). (feat/mega-refactor-tramos)

### Added

- **ccxt-first cascade + per-provider limiter config (P48-bis):** new
  `src/provider/infrastructure/ccxt/` REST adapter (14th provider:
  CEX tickers + OHLCV over the unified ccxt API with
  `enableRateLimit`, exchange allowlist via
  `MARKET_DATA_CCXT_EXCHANGES`, optional `ccxt` peer loaded by
  dynamic require — missing package resolves to null, fail-open).
  The snapshot cascade is ccxt-first where it covers (CEX pair
  symbols via `covers()`); every other fetcher keeps its existing
  order and the first-non-null merge is untouched, so onchain
  addresses fall back exactly as before. Every adapter exposes its
  full limiter contract through the port
  (`DataProviderPort.getRateLimitConfig`: window, quota,
  per-endpoint costs, backoff 1s->30s; registry descriptors carry
  the same numbers, ccxt at 600/min with OHLCV cost 5). The
  outbound gate burns one bucket slot per cost unit, skips the
  bucket for uncovered inputs (zero quota burn), and denies with
  an explicit fail-open error naming quota and cost. Failing-first:
  `provider-limiter-config.spec.ts` + `ccxt.service.spec.ts` +
  `cascade-order.spec.ts` (order + ccxt-wins-where-covers +
  onchain fallback) + `rate-limited-fetchers-cost.spec.ts`
  (cost burn + deny message + covers-skip + adversarial quota
  breach on a real sliding-window limiter still merging the rest).
  Verified: 61 suites / 232 tests green, `tsc --noEmit` clean,
  live `:4146` (registry lists ccxt first; onchain snapshot merges
  dex+gecko with `ccxt: no data`; CEX symbol pends explicitly with
  the peer absent — real exchange hit operator-gated, no new deps).
  (feat/mega-refactor-tramos)

- **Holders + dev-wallet via Birdeye (quote `devWallets[]` + `devPctSupply`):**
  `BirdeyeService.getHolderProfile` (`GET /token/v1/holder_profile` —
  tag mix incl. dev hold_amount/percent_of_supply/PnL) +
  `getDevPositions` (`GET /token/v1/holder_positions?labels=dev`, top 10)
  with no-key -> null, never throws. New `src/holders/`
  (`DevHoldingsService` fallback chain: Birdeye -> Helius
  `getFirstTxFeePayer` as probable dev -> explicit nulls, never crash;
  non-solana -> nulls). `SnapshotQuote` gains `devWallets` +
  `devPctSupply` (empty=nulls; aggregator merge extended); `HoldersModule`
  wired in `AppModule` + `SnapshotModule`; `AddressSnapshotService`
  attaches dev holdings for kind=token only (history quote carries them,
  `dev:*` providerErrors, `pending` only when price merge AND dev both
  empty). Compat `GET /api/market-data/snapshot` returns 17 fields.
  Failing-first: `dev-holdings.service.spec.ts` (birdeye map + helius
  probable + no-key nulls + throw nulls + non-solana).
  (feat/mega-refactor-tramos)

- **Supply fields end-to-end (`totalSupply`, `circulatingSupply`,
  `maxSupply`, all-nullable):** `SnapshotQuote` + `SNAPSHOT_QUOTE_FIELDS`
  - `emptySnapshotQuote` extended, so the first-non-null merge prefers
    real values and providers without supplies merge nulls without
    crashing. Wired in `provider-quote.fetchers.ts`: GeckoTerminal
    (`total_supply` string→number), Birdeye (`totalSupply`), Mobula (new
    fetcher, `totalSupply` only), CoinGecko (new fetcher with the
    CoinGecko platform map; `CoinGeckoTokenInfo` + service now parse
    `total_supply`/`circulating_supply`/`max_supply`). DexScreener,
    Moralis and RugCheck carry no supplies (null). `snapshot_history`
    persists them with zero migration (`quote` is jsonb); the compat edge
    `GET /api/market-data/snapshot` returns 15 fields. Failing-first:
    `provider-quote-fetchers-supply.spec.ts` (per-provider mapping +
    adversarial no-supply + merge preference) + gateway 15-field pin.
    (feat/mega-refactor-tramos)

- **Permanent chain-logo resolver:** new `src/chain-logo/` module
  (`ChainLogoModule`, wired in `AppModule` + `GatewayModule`) serving
  frontend `[logo] name` badges from `uploads/chain-logo/<chain>.png`
  (overridable via `CHAIN_LOGO_DIR`). Resolution is fetch-ONCE per
  chain — TrustWallet assets primary
  (`raw.githubusercontent.com/trustwallet/assets/master/blockchains/<slug>/info/logo.png`,
  with `bsc` pinned to the `binance` slug), CoinGecko
  `asset_platforms` image fallback, 1x1 PNG placeholder when every
  upstream 404s (logged, never thrown; unknown chains get the
  placeholder with zero network/disk touch). No periodic refresh —
  only the explicit `POST /api/v1/chains/:id/logo/refresh` (`admin`
  scope) re-fetches. Gateway edge `GET /api/v1/chains/:id/logo`
  (`@Public()`, `Cache-Control: public, max-age=86400, immutable`,
  unknown chains 200 the placeholder, never 404), and every
  `ChainInfo` now carries `logoUrl`
  (`/api/v1/chains/<id>/logo`). Verified: 55 suites / 199 tests green
  (fetch-once/no-re-fetch, fallback, missing-chain placeholder,
  gateway bytes + cache + refresh + catalog `logoUrl`), `tsc --noEmit`
  clean, live boot (all 6 catalog logos fetched from the TrustWallet
  primary; second reads keep mtime, refresh re-fetches).

### Fixed

- **Staging backport 2026-09-27:** default bind `MARKET_DATA_HOST`
  changed `127.0.0.1` → `0.0.0.0` (loopback-in-container is unreachable
  via the published-port mapping; droplet staging already ran with
  `0.0.0.0`). Dev may still set `127.0.0.1` explicitly for
  loopback-only.

### Added

- **On-demand ccxt streaming over ws (Tramo 3, todo 11, P49):** new
  `src/stream/` module (`StreamModule`, wired in `AppModule` +
  `GatewayModule`) multiplexing `watchTickers` / `watchOHLCVForSymbols`
  feeds over exactly ONE shared WS connection per exchange
  (`ExchangeConnectionManager`: lazy connect, refcounted
  watch/unwatch, EXCHANGE_DOWN fan-out with `retryAfterMs` and 1s->30s
  backoff reconnect + re-watch while refs remain; closes on last
  unsub). The thin `StreamBrokerService` adds P46 auth (ticker=`read`,
  ohlcv=`snapshot`, legacy env key admin-equivalent, fail-open mirrors
  the HTTP guard), per-client subscriptions (100/client cap, exchange
  allowlist via `MARKET_DATA_STREAM_EXCHANGES`), the SHARED REST 60/min
  sliding budget (same `gw:<ip>` key + singleton limiter — REST abuse
  throttles WS subscribes and vice versa), and backpressure (128-deep
  per-client queues, drop-oldest + drop counter) with full cleanup on
  disconnect (every manager ref released — no leaks). Transport is
  Socket.IO (`gateway/infrastructure/ws/`, namespace `/market-data`;
  `gateway/api/ws/` stays a `@deprecated` compat re-export): zero new
  deps, same stack as the backend WsGateway + dashboard client. The
  ccxt.pro driver is an OPTIONAL peer behind
  `MARKET_DATA_STREAM_DRIVER=ccxt` (default `memory` driver is
  deterministic; missing peer fails loudly, never silently). Verified:
  43 suites / 149 tests green (+5/+23), `tsc --noEmit` clean, `nest
build` clean, live `:4133` matrix (keyless/wrong-key handshakes
  UNAUTHORIZED + disconnect; 100 subs stream ~13.3k ticks with zero
  loss; REST p95 = 2.40ms < 500ms PASS under the fan-out; full
  unsubscribe + disconnect + re-subscribe clean).

### Added

- **Scoped API-key auth system (Tramo 3, todo 10, P46 seguridad):** new
  `src/auth/` module (`AuthModule`, wired in `AppModule` + `SharedModule`)
  replacing the single env-key check with per-client keys in scopes
  `read` / `snapshot` / `admin` (hierarchy admin > snapshot > read;
  `read` = GET chains/providers/addresses/tokens, `snapshot` adds the
  batch POST + compat snapshot GET, `admin` adds `POST|GET
/api/v1/auth/keys`, `POST /api/v1/auth/keys/:id/rotate`, `DELETE
/api/v1/auth/keys/:id`, `GET /api/v1/auth/audit`). Keys are stored as
  SHA-256 hashes only (plaintext returned exactly once on create/rotate;
  list/audit/logs/responses/errors never carry key material — enforced
  by a source-scanning grep-gate spec). Rotation is zero-downtime with
  no redeploy/reboot (admin endpoint, dual-key 10-min grace: old + new
  both verify until grace expires; revoke kills immediately). Per-key
  sliding-window rate-limit (per-key `rateLimitPerMin`, 429 on breach)
  plus an append-only access audit (key id + name, method, path, status
  — query strings stripped). Loopback bind by default (`MARKET_DATA_HOST`
  default `127.0.0.1`; wider exposure is an explicit operator decision —
  Tailscale IP or `0.0.0.0`, never the default). Legacy
  `MARKET_DATA_API_KEY` still works as admin-equivalent; fail-open only
  when no auth is configured at all (empty env + empty store). No-key is
  401, wrong scope is 403. Verified: 38 suites / 126 tests green
  (+6 suites / +17 tests), `tsc --noEmit` clean, boot `:4123` curl matrix
  (health 200 keyless; chains 401 nokey/wrong, 200 keyed; batch 403 on
  read key, 200 on snapshot key; rotate old + new both 200; revoke 204;
  list/audit carry prefixes only, no hashes or full keys).

### Changed

- **Global hexagonal restructure + legacy deprecated (Tramo 3, todo 12,
  P50, no behavior change):** every module now follows domain/ +
  application/ + infrastructure/ (chain, address, cache, rate-limiter,
  gateway, shared join the already-hexagonal provider). New canonical
  `src/snapshot/` module owns `AddressSnapshotService` (moved verbatim
  from address/ with its domain types; `SnapshotModule` composes
  Address + Chain + Provider ports; gateway/app wire it). All pre-hex
  roots (plus gateway `api/http/`) stay as `@deprecated` compat
  re-exports naming the new home (removal at cutover, todo 8), so
  `chain/*`, `address/*`, `cache/*`, `rate-limiter/*`, `gateway/*`,
  `shared/*` importers — and the backend cross-app shims into
  `provider/infrastructure/**` — resolve unchanged. Additive-only new
  code: domain ports (rate-limiter, circuit-breaker, address-probe),
  gateway edge policy (rate budget + batch cap/TTL + cache-key
  builders), address seed extraction. Verified: 32 suites / 109 tests
  identical pre/post, `tsc --noEmit` clean, `nest build` clean, boot
  `:4000` spot-checks (chains, detect, 13 providers, snapshots, tokens
  alias, compat 12-field snapshot, `x-cache: HIT`, batch-50 cap,
  rate-limit 429s).

### Added

- **HTTP bridge + SLO + staged flag (Tramo 3, todo 5, G-17):**
  `GET /api/market-data/snapshot?chain=&address=` compat edge (the exact
  contract kol-system calls; 12 `MarketData` fields, null + explicit
  `status: 'pending'` until the todo-3 aggregators land; bad chain → 404,
  never a silent null; 30s cache with `x-cache: HIT`) +
  `POST /api/v1/addresses/batch` (1..50 items, per-item `{ error }` on
  bad rows, 400 over cap, per-item cache shared with the GET edge so
  batch traffic warms single reads). Measured SLO: warm-burst p95 =
  0.96ms < 500ms PASS (50 GETs + 2 batch-50 in one 60/min window;
  `scripts/measure-slo.mjs`; evidence
  `.omo/evidence/task-5-mega-refactor-market-data.log`). Honesty note:
  numbers cover edge + cache (pending shells, no provider fan-out yet) —
  re-measure after aggregators land before any staging flip. Consumers:
  kol-system dev flipped (`USE_DATA_SERVICE_API=true` + http-primary /
  local-fallback); backend HTTP leaf landed with default FALSE (no flip —
  flipping would regress enrichment); feed-publisher verified N/A;
  staging/prod flags stay false until the 24h staging SLO (todo 8).

### Changed

- **Provider hexagonal restructure (provider-hex, pure move, no behavior
  change):** `src/provider/` now follows domain/application/
  infrastructure layers — `domain/` owns `DataProviderPort`,
  `ProviderDescriptor` + `DEFAULT_PROVIDERS`, and the health value
  objects; `application/` owns `ProviderRegistryService` (composing the
  extracted `ProviderHealthChecker` with the identical up/degraded/down
  truth table, plus an additive `listFailoverOrder` over the pure
  `ProviderFailoverPolicy`); `infrastructure/<name>/` keeps one dir per
  adapter. Root files and `infrastructure/core/` remain as compat
  re-exports so `provider/*` consumers (address, gateway) and backend
  shims resolve unchanged. 30 suites / 103 tests (identical), `tsc` +
  `nest build` clean.

### Added

- **Physical provider extraction (Tramo 3, todo 4, C-DATA-01, P46/P47):**
  the 13 market-data adapters (alchemy, birdeye, coingecko,
  coinmarketcap, dexscreener, fluxrpc, geckoterminal, helius, mobula,
  moralis, pumpdev, rugcheck, solana-rpc) are now canonically owned by
  this app under `src/provider/infrastructure/` (relocated from the
  interim `src/address/infrastructure/providers/` P45 path; address
  consumes via ports only). `ProvidersModule` aggregates them;
  `ProviderRegistryService` tracks 13/13 descriptors (new `trading`
  kind for pumpdev). Backend keeps deprecated re-export shims
  (dual-run, local default; HTTP bridge + SLO + flag default land in
  todo 5, G-17; removal at cutover, todo 8). chain-dexter-bot stays
  integrated (standalone extraction is todo 9). 30 suites / 103 tests
  (3 new: registry-13, providers barrel, providers-module boot).

### Added

- **Universal address model (P45):** new `src/address/` absorbs the
  token stub — `Address = chain + address + kind` (`wallet | token |
program | exchange | unknown`) via `AddressIdVo` (mandatory chain
  qualifier, lowercased `chain:address` key, kind in equality),
  `AddressKindDetectorService` (explicit hint > known registries >
  optional on-chain probe > format; garbage resolves to explicit
  `unknown`, never a crash), and `AddressSnapshotService` (one
  snapshot shape per kind; token logic is the kind=token path).
  Gateway edge `GET /api/v1/addresses/:chain/:address[?kind=]`;
  `GET /api/v1/tokens/:chain/:address` stays as a deprecated
  kind=token alias. `src/token/` + `TokenIdVo` kept as deprecated
  aliases (removal in final review). 27 suites / 85 tests; live
  `:4000` edge verified (per-kind snapshots, unknown-no-crash, 404
  on unknown chain).

- **Chain + provider + cache + rate-limiter + gateway shell (todo 2,
  P43):** `chain/` (6-entry static catalog, EVM/Solana format-only
  probers, `DetectChainService` with parallel-probe coordination),
  `provider/` (7-descriptor health/latency registry with
  up/degraded/down tracking), `cache/` (global TTL port + in-memory
  adapter + `CacheService.getOrSet` + `CacheInterceptor` with
  `x-cache` HIT/MISS), `rate-limiter/` (global sliding-window limiter
  - per-key circuit breaker), and `src/gateway/` (P43 edge: the only
    feature controllers — chains, providers status, token snapshot
    shell — composing module ports with per-endpoint rate-limit + cache;
    x-api-key enforced globally, health public). 21 suites / 55 tests;
    live `:4000` edge verified (curl + key/caching checks).
- **App setup + shared kernel (todo 1, Variante A):** NestJS 11 service skeleton
  (`:4000` dev / `:4001` staging / `:4002` prod), `GET /api/health`,
  5 feature-module stubs (token, chain, provider, cache, rate-limiter),
  and the transversal `src/shared/` (kernel, ChainId/TokenId value objects
  with lowercased `chain:address` keys, x-api-key helpers, `ApiKeyGuard`,
  domain exception filter, app + database config). 10 suites / 17 tests.
- **Precondition Gate T2 (todo 0):** 6/6 backend feed areas verified carrying
  `Moved to apps/feed-publisher` headers (see
  `.omo/evidence/task-0-mega-refactor-market-data.log`).
