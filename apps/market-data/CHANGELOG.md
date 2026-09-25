# Changelog

All notable changes to `@onchain-bot/market-data` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
