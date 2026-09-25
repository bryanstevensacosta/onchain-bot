# Changelog

All notable changes to `@onchain-bot/market-data` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
