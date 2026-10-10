# Changelog

All notable changes to `@onchain-bot/market-data` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Helius history origin leg (dexter plan todo 36):** LAST-resort
  Solana leg for graduated-old mints (live curve closed — PDA batch
  - heaven both miss): ONE `getAddressHistory` pull (limit 100) →
    slot-ascending earliest → ONE `parseTransaction` for that
    signature only → pure program-id actor table
    (`HELIUS_ORIGIN_PROGRAM_TO_LAUNCHPAD` + Believe fee-payer rule;
    never name/symbol keying). Appended last (fast legs win with zero
    Helius calls, spy-pinned); EVM never touches Helius. Archival
    budget env `LAUNCHPAD_HELIUS_ORIGIN_TIMEOUT_MS` (default 8000,
    inside the outer 10s detector cap); 429/timeout/empty/unknown →
    fail-open null. Key via DI `HeliusService` (`HELIUS_API_KEY` at
    runtime, never printed/stored). INCOME not live-confirmed
    (full-tx 429-walled) → labeled-synthetic fixtures + documented
    live attempt. Specs: `launchpad-detector-helius-origin.spec.ts`
    (synthetic-resolve + fast-legs-win + EVM-untouched + Helius-down
    nulls + live-earliest-shape null + no-name-keying + mapper +
    timeout-resolver).

- **Detector parallel slow legs (detector-budget follow-up):** the EVM
  brand-API legs (bankr ‖ mintclub ‖ Pons SSR) run CONCURRENTLY via
  `Promise.allSettled` under the ONE shared `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS`
  wall-clock deadline (each leg owns an AbortController cut at the same
  instant — total ~= max, not sum — so the live ~1.6s bankr 404 miss +
  ~1.3s Pons SSR fit the ~2s default together). Precedence unchanged
  (by position: bankr > mintclub > pons, never by finish order); the
  factory receipt fallback fires only on API all-miss (a hit
  short-circuits with zero extra fetches); all-fail stays fail-open
  null. Specs: parallel-timing + precedence-preserved + all-fail-null
  - fast-path-untouched (`launchpad-detector-parallel.spec.ts`).

- **Detector own deadline + Pons cache (dexter plan todo 35):** the
  launchpad detector is OUT of the 400ms snapshot-tail extras budget
  (the Pons SSR leg measures ~1.3s live and always timed out there).
  New ~2s deadline from env `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS` (default
  2000, single value shared by the Pons SSR AbortController cut and
  the tail's launchpad wait); fast-leg hits return untouched (leg
  order unchanged), venue/dev keep 400ms. Positive `pons`
  resolutions cache on the shared `CacheService`
  (`pons:launchpad:<chain>:<mint>`, env `PONS_CACHE_TTL_DAYS`
  default 14, nulls never written) — no new table (origin is
  immutable per mint, TTL is memory hygiene).

- **OHLC-derived 24h change fallback (dexter plan todo 33):** when
  every native `priceChange24h` is null (Gecko-only tokens like
  STAGEVEIL), the snapshot derives `(close-now − close-24h-ago) /
close-24h-ago × 100` from the pool's keyless GeckoTerminal OHLC
  (`GET …/pools/{pool}/ohlcv/hour`, `aggregate=1`, `token=` sided,
  verified live on `robinhood_0x9269…ef60`). Precedence is
  structural (leg fires only on all-native-null, zero extra calls
  otherwise; `sources` gains `geckoterminal-ohlcv`); window is exact
  24h (now-leg ≤6h fresh, past anchor ±2h, gaps → honest null, never
  extrapolated). Specs: exact math on the real STAGEVEIL capture +
  precedence (native wins, no OHLC calls) + insufficient-OHLC nulls.

- **Pons detector leg re-pin (dexter plan todo 34):** ponsfamily.com
  redesign retired the todo-26 page shape (`· pons` titles + canonical
  guard — both pages now answer `| Pons` titles with address-carrying
  canonicals). `detectPons` re-pinned to token-specific
  `<title>… | Pons</title>` (generic `Token | Pons` shell rejected)
  plus robots-index guard (launched `index, follow` vs shell
  `noindex, nofollow`); both required, fail-open null. R1-era Pons
  factory set verified live with code on 4663 (receipt leg backstop
  intact). Specs: NYMA live-shape match + shell/robots/retired-shape
  no-match cases. PONYO not probed (address prefix only, never
  guessed — sibling todo 33 owns it).

- **New providers: DeFiLlama + Etherscan V2, conditionals measured
  (dexter plan todo 32):** coverage-probe gate first (8 chains,
  keyless where possible) — DeFiLlama `coins.llama.fi`
  `prices/current` INCLUDED on 7 chains (ethereum/solana/bsc/base/
  arbitrum/polygon + optimism/unichain mapped-for-catalog-day;
  `robinhood` EXCLUDED with proof) as the last free fetcher leg
  (`priceUsd` + mint-bound `symbol` only, confidence floor 0.5,
  1 call/scan, 60/min bucket); `/chart/{coin}` proven coarse
  (1-point series) so `getChartMax` stays service-level and the
  fan-out never calls it (ATH-history rule: `fdvAth` stays own 90d
  history). Etherscan V2 (`ETHERSCAN_API_KEY`, skip-if-absent
  zero-network) as the last leg overall: `tokenholdercount` →
  `holders` only (PRO-gated, free-key nulls expected);
  `tokensupply` (raw base units, never UI-mapped) and `getsourcecode`
  (no quote column) stay service-level with the reason pinned;
  4663-on-free-key gate closed as `wontfix-documentado` (no key;
  Robinhood/Arc free window expires 2026-10-15). Conditionals
  measured, none wired: Jupiter Price V3 loses the bake-off
  (p50 1.088s vs dex 0.705s / gecko 0.748s, zero new token class —
  OUT documented); 1inch key-gated (401 keyless, SKIP documented);
  CoinPaprika listed-only (CHALE search empty, no address→id path,
  no ATH column — OUT documented). Precedence: both wired legs
  LAST (fallback-after-incumbents); best-pick/venue untouched. Specs:
  27 new (service + legs + QPS-math-as-test + order pins).

- **Top-5 exploitation of existing providers (dexter plan todo 31):**
  five legs over current adapters, zero new vendors/keys — (1)
  DexScreener `search` + batch `tokens/v1` fetcher fallbacks
  (strict → search → tokens/v1, shared strict
  `selectBestPairSummaryForSlug` + pair-side check; `getTokensInfo`
  fixed to the live bare-array shape) + `unichain` slug (map +
  fetcher + registry descriptor); (2) GeckoTerminal `search/pools`
  - `tokens/multi` (≤30) + `simple/token_price` (≤30) fetcher legs
    (info → multi → search on info-null; pools → simple on
    price-gap); (3) RugCheck `search` fetcher fallback (exact-mint
    `holders` + `marketCapUsd` on summary-miss) + `stats/new_tokens`
    feed-only pre-warm input (never per-snapshot); (4) Birdeye
    `supportsChains` 1→7 with `x-chain` mapping (optimism
    mapped-for-catalog-day, unichain deliberately unmapped) +
    `token_security` service method (25 CU, fetcher-excluded:
    `SnapshotQuote` has no security columns); (5) Mobula
    `token/price` fetcher fallback (markets-hit byte-identical) +
    batch `POST token/price` (≤500, positional `error` slots
    dropped). Quota rule: every leg fires only on the previous leg's
    null; 429/403 fail-open null. Specs: 40 new (per-leg behavior +
    no-regression spy pins).

- **Chainstack chain allowlist (`CHAINSTACK_CHAINS`):** Chainstack
  free allows ONE chain per endpoint, so comma-separated `CHAINSTACK_CHAINS`
  (e.g. `solana`; empty default = all rows, today's behavior) gates the
  Chainstack tier rows (EVM `rpcCallForChain` + Solana `buildRpcUrls`) —
  non-listed chains skip SILENTLY with a debug log (zero network, same
  skip-if-absent discipline). Parsing tolerant (trim, lowercase, ignore
  empties). Env empty in `.env.example`; `app.config.ts` gains
  `chainstack.chains` + `solanaRpc.chainstackChains`. Specs:
  allowlist honored (spy), default-off, malformed ignored.

- **Discovery cache with migration invalidation (dexter plan todo
  30b):** `DiscoveryCacheService.resolveDiscovery(chain, mint)`
  caches `(chain,mint)→{pairAddress,dexId}` in a new `discovery_cache`
  table (`1774000000000-CreateDiscoveryCache` migration, in-memory
  fallback when DB-less) and verifies each hit with the pinned
  tripwire `getPairByAddress(chainId, pairAddress)` (exactly 1 HTTP,
  never re-discovery) — a verified hit serves tripwire-fresh numbers
  with zero `token-pairs` calls (the measured 640–978ms discovery
  leg). Invalidation on tripwire `dexId` mismatch (or null
  tripwire — dead vs transient are indistinguishable, fail-open to
  re-discovery), on-chain `migrated:true` (Solana fast path calls
  `invalidateDiscovery(chain,mint)`; next scan re-discovers the pool
  and re-pins, promote-once; EVM backstopped by the tripwire), and
  30d lazy TTL on read + janitor (`DiscoveryCacheJanitorService`,
  no cron; contrast pinned: discovery 30d vs history 90d). Cached
  `dexId` never flows into `launchpad.id` (venue vs origin
  vocabularies, spec-asserted). Wired cache-first into fast-path
  Solana/EVM discovery, `resolveVenue`, and the dexscreener quote
  fetcher (optional dep with direct fallback; tiers/transports and
  detector logic untouched; null discoveries never pinned). Specs:
  2nd-scan spy (zero `getPairsByChain`/`getBestPairSummaryForChain`
  - tripwire-once), mismatch, null-tripwire, empty-miss, unmapped,
    pump-curve→pool migration, TTL-expiry, separation,
    partial-surface fallback.

- **Free-B RPC providers behind ChainRpc (dexter plan todo 30a):**
  EVM `rpcCallForChain` gains the Chainstack tier (Alchemy → dRPC →
  Chainstack → public, skip-if-absent on `CHAINSTACK_API_KEY`, dRPC-copy,
  `served-by=` labelled); Solana tiers go `{name,url}` (Helius primary →
  Shyft → Chainstack → public) with per-method carve-outs (index/holders
  legs never touch free tiers; Shyft Index 0/s, holders excluded,
  Chainstack Solana 5 RPS). Matrix pinned in `alchemy.chains.ts`
  (Shyft Solana-only; Chainstack EVM+Solana with `*`-asterisks, no
  robinhood/avalanche row); Moralis-nodes closed as wontfix-documented
  (no builder export; probe recipe pinned for the owner); QPS-math as a
  test on the `cold explicit-chain snapshot` shape (bare-sweep multiplier
  noted); `launchpad-detector receiptTo` excluded with grep-proof reason;
  no kill-switch. Specs: `free-b-tiers.spec.ts` (tier order, skips,
  carve-outs, QPS). Env: `CHAINSTACK_API_KEY=` + `SHYFT_API_KEY=` empty
  in `.env.example`; `app.config.ts` gains `drpc/chainstack/shyft`
  namespaces.

- **Parallel tail + wired breaker + EVM-miss spans (dexter plan
  todo 29):** `AddressSnapshotService.buildSnapshot` races the three
  tail extras (launchpad / venue / dev-holdings) under one shared
  budget — max 3 in flight (chunked `runTailCapped`), 400ms per extra,
  degrade-to-null with explicit `tail:<extra>` notes (card never
  blocked); fdvAth stays sequential (read-before-save rule). Serve logs
  carry `tailMs=` + `breakerSkipped=`. The existing
  `CircuitBreakerService` (5 fails → 30s cool-off, memory store with
  reset-on-deploy accepted) gates the fan-out fail-open
  (skip-not-throw); half-open admits a single cheapest probe; state via
  `breakerStates()` + transition logs; throws-only signal with a
  documented `'no data'` blind spot. `DirectFastPathResult.timings`
  gains nullable `v2Ms`/`v3Ms`/`anchorMs` + a one-line `direct-miss …
stage=…` debug per EVM-miss leg (numbers reported before any
  read-path change). Stale propagation N/A (wait-time change only —
  19b1 contract untouched). Specs: tail caps/timeout/degrade + breaker
  open/close/half-open/flapping/no-data/unknown-name.

- **Helius-keyed routing observability + Robinhood 64-hex fix
  (dexter plan todo 28):** `SolanaRpcService` boots LOUD
  (`Logger.log`): `keyed (primary host=<hostname>)` when
  `HELIUS_RPC_URL_MAINNET` routes the primary path, else
  `public-only` naming the missing var — hostname-only redaction,
  key material never logged. Every probe logs `served-by=
<primary|public>` (debug, same contract as EVM `evm-rpc`); 401/
  403/429 or quota-flavoured errors `warn` with the runbook pointer.
  Routing itself is the pre-existing seam (`app.config.ts` →
  `SOLANA_RPC_CONFIG`; already spec-pinned) — this lane adds only
  observability. STATUS: var empty/absent at lane time →
  keyed routing PENDING-OWNER (public-only verified live).
  `DirectFastPathService.resolveEvm` shape-guards V4 poolIds
  (64-hex `pairAddress` → fail-open `null`, zero reader calls, no
  `-32602` tier walk); full V4 routing verified non-applicable at
  this seam (no lens row for robinhood, no leg decimals from
  discovery — follow-up todo). Pinned fixtures in
  `measurement-fixtures.spec.ts` (14 rows from
  `task-p95-measure.log`). Free-tier math pinned: Helius ~10 rps,
  plain JSON-RPC only in the hot path (no DAS/enhanced).
  `HeliusService` untouched.

- **Serve-stale floor, no background refresh (dexter plan todo
  19b1, SWR without the R):** new `SnapshotHistoryRepository.
findLatestReady(key, kind, maxAgeMs)` — exact stored-key
  (`AddressIdVo.key` = `chain:address`) newest-`ready` lookup riding
  the existing `(key, createdAt)` BTREE (`WHERE key+kind+ready`
  `ORDER BY createdAt DESC LIMIT 1`; no `(chain,address)` composite
  migration — that pair is never queried). When the live fan-out
  fails, `AddressSnapshotService` replays that row with `stale:
true` + `staleAsOf` (row ISO) + `staleAgeMs`, `status: 'ready'`
  (no new status value); over-bound rows (> 24h default,
  `SNAPSHOT_STALE_MAX_AGE_HOURS` override, `resolveStaleMaxAgeMs`
  pinned) and pendings-only histories answer honest `pending`.
  Stale replays are never cached (service, edge `CacheInterceptor`,
  batch `shouldCache`) and never re-persisted — the next request
  retries providers naturally, and no cron/queue/timer/
  fire-and-forget exists on the path (stampede + unhandled-
  rejection classes absent by construction). The trio travels on
  the compat edge, batch items, and the full `AddressSnapshot`
  (fresh: explicit `stale: false`, null as-of/age). Specs:
  newest-ready/pendings-only/over-bound/cross-key isolation/indexed
  query-shape (both store paths), service replay + no-cache/
  no-repersist pins, edge + batch stale bypass. No retry/breaker
  (19b2/19b3 lanes, disjoint files).

- **Single retry with cap + jitter, exactly-one (dexter plan todo 19b2):**
  per-fetcher wrapper `applySingleRetryFetchers` wired OUTSIDE the
  outbound gate (policy → retry → gate → aggregate), so each attempt
  burns from the SAME `outbound:<name>` bucket — worst case 2 × cost
  per miss per fetcher, no phantom budget. Retries EXACTLY ONCE only
  on timeout / 429-with-`Retry-After` / 5xx (adapters surface these as
  `RetryableProviderError`; 404 and everything else stay `null`, never
  retried); delay `min(Retry-After, 2000ms)` + full jitter
  (`Retry-After: 120s` waits ~2–4s). Second failure → `null` fail-open
  (no third attempt; exhausted retries debug-logged for 19b3). Live
  evidence: GeckoTerminal 429 wall captured 2026-10-07
  (`.omo/evidence/task-fe-retry.log`). Specs: `fetcher-retry.spec.ts`
  - `retryable-provider.error.spec.ts` (24 tests: exactly-one,
    cap-respected, 404-never, jitter statistical decorrelation). No
    breaker wiring (19b3), no SWR/contract changes (19b1).

- **Robinhood enrichment: pons leg + gecko venue (dexter plan todo 26):**
  Pons origin leg in `LaunchpadDetectorService` (robinhood-scoped,
  keyless single `GET ponsfamily.com/launchpad/<address>`: token title
  - canonical link carrying the address both required, unknown-address
    flight-data echo excluded by canonical-link check, fail-open null on
    any miss; pre-existing `pons` table row, zero table-shape change).
    Gecko→venue fallback in `AddressSnapshotService.resolveVenue`
    (DexScreener hit wins; on miss/throw the best GeckoTerminal pool's
    `relationships.dex.data.id` feeds `snapshot.venue` verbatim with
    empty labels — live STAGEVEIL `0xcf7f…f3597` resolves `pons-v2-dex`).
    Specs: 6 pons detector cases (match / Buy-token shell / redesign
    guard / flight-data echo / chain-scope / transport failure) +
    `address-snapshot-venue-gecko.spec.ts` (STAGEVEIL non-empty venue,
    dex-hit precedence, throw-fallback, null-on-miss, launchpad
    separation) + `selectPoolQuote` dexId carry-through. No new keys,
    no registry/dexter/frontend touches.

- **GeckoTerminal network coverage: robinhood + audit (dexter plan todo 25):**
  `GECKO_NETWORK_SLUGS` now maps all 9 audited chains (added
  `robinhood`, `optimism`, `unichain` — every slug verified live
  2026-10-06 via `GET /networks`) and the gecko fetcher
  `supportsChains` grows 4 → 7 (`arbitrum`, `polygon` had slugs but
  were never consulted; `robinhood` is new). `optimism`/`unichain`
  stay out of `supportsChains` (no `STATIC_CHAINS` row, so snapshots
  404 before fetchers — slug mapped for the day the catalog lands).
  NEW `GeckoTerminalService.getTokenPools`
  (`GET /networks/{network}/tokens/{address}/pools`) + pure
  `selectPoolQuote` (best by `reserve_in_usd`, side-verified via
  relationship ids: pool `fdv_usd` is base-token FDV, so a quote-side
  token takes price only, never fdv): when token `/info` lacks price
  or fdv, the fetcher fills the gaps from the best pool (never
  overwrites info values; info miss still resolves null, never a
  phantom). Live 2026-10-06: STAGEVEIL `0xcf7f…f3597` on `robinhood`
  (DexScreener: 0 pairs even cross-chain) resolves symbol/holders via
  info + FDV `3471.76` via pool `robinhood_0x9269…ef60`. Also sets
  `STATIC_CHAINS.robinhood.geckoTerminalSlug` (`null` → `robinhood`;
  informational, zero consumers). Failing-first:
  `provider-quote-fetchers-gecko-nets.spec.ts` (11 tests: live-shaped
  fixtures, slug pins, unmapped passthrough, side rule, fail-open).

- **EVM RPC fallback tiers + Robinhood coverage (dexter plan todo 24):**
  `AlchemyService.rpcCallForChain` now walks fallback tiers per call
  (first non-null wins, never throws): Alchemy (only when
  `ALCHEMY_API_KEY` set) → dRPC free (`DRPC_NETWORKS` slugs for
  ethereum/base/bsc/arbitrum/polygon/optimism via
  `https://lb.drpc.live/<network>/<key>`, skipped silently without a
  key — owner creates one at drpc.org) → keyless public RPC
  (launchpad-table URL) → honest `null`. Per-tier timeouts (Alchemy
  8s, `EVM_RPC_TIER_TIMEOUT_MS` 5s elsewhere) + `served-by=<tier>`
  debug log for quota decisions. Coverage: NEW
  `EVM_CHAIN_TRANSPORTS.robinhood` (`robinhood-mainnet`, chainId
  4663, Multicall3 verified PRESENT via live `eth_getCode`
  2026-10-06) + DexScreener slug `robinhood` (live 2026-10-06:
  `0x968B…5583` resolves to the `uniswap` v4 NYMA/ETH pair, liq
  ~$6K) + dexscreener fetcher `supportsChains`. Specs: tier order
  with tier-down mocks, Robinhood NYMA fixture, all-down → null.
  Legacy mainnet-only `rpcCall` untouched (backend prober contract).
  Boundary: `STATIC_CHAINS` still lacks robinhood, so chain-qualified
  snapshots 404 unknown-chain until a catalog todo lands.

- **Direct fast-path wire-up (dexter plan todo 22, serve seam):**
  NEW `snapshot/application/direct-fast-path.service.ts` tries the
  Lane E/S on-chain readers FIRST under a HARD 800ms deadline while
  the aggregator fan-out runs concurrently; sane direct values serve
  a partial card immediately (dev holdings skipped and marked) and
  the in-flight fan-out completes in background for the log-only
  tolerance check. Any miss falls back to the byte-identical fan-out
  path (existing specs pin it with the fast path mocked null).
  Measured 2026-10-06: p95 cold <800ms missed on live routes
  (Helius 2-round paths over budget; Alchemy 403 on all EVM
  subdomains in this env); reader-level parity proven live
  (-3.8bps pump, -27.6bps Raydium vs aggregator, tolerance 100bps).

- **On-chain EVM readers + tolerance (dexter plan todo 22, Lane E):**
  NEW `provider/infrastructure/onchain/` files only (no snapshot-core
  edits, no wiring yet): `evm-pools.codec.ts` (pure ABI decode —
  V2 getReserves/token0/token1, ERC20 decimals/totalSupply, V3
  slot0/liquidity/fee, V4 StateView getSlot0/getLiquidity + BigInt
  price math; selectors derived 2026-10-05 via
  `keccak256(signature)[:4]`, live cross-checked; uninitialized
  V3/V4 `sqrtPriceX96 == 0` and double-zero V2 reserves decode to
  `null`; fee semantics documented — V2 reserve ratio is a PRE-FEE
  mid, V3/V4 `sqrtPriceX96` is fee-FREE spot),
  `onchain-evm.reader.ts` (`OnchainEvmReaderService` over the frozen
  Lane T `MulticallClient.tryAggregate` + `ChainRpc` existence gate:
  V2/V3 views with decimals per leg, V4 via StateView lens in ONE
  batch with caller-supplied decimals; StateView verified on
  ethereum + base only, other chains resolve `null`
  (`v4-lens-unverified`); every method BigInt-first, fail-open
  `null`, never throws), `evm-tolerance.ts`
  (`selectPreferredQuote` at the snapshot seam: defined direct
  fields win over the aggregator quote, direct `null` returns the
  aggregator quote verbatim, `priceUsd` divergence beyond 100 bps
  is a `Logger.warn` metric only — never gates the render).
  Live-verified 2026-10-05 with ONE `eth_call` tryAggregate
  (getReserves + token0/token1) on DexScreener-discovered Uniswap
  V2 WETH/USDC `0xB4e16d…C9Dc` (ethereum): legs confirmed
  USDC/WETH, reserves ~10.51M/~3892 vs ~$21.03M DexScreener
  liquidity. QPS budget + quota owner (`ALCHEMY_API_KEY` holder)
  in the codec header.

- **On-chain transport foundation (dexter plan todo 22, Lane T):**
  chunked Solana `getMultipleAccounts` (≤100/batch, parallel chunks,
  per-chunk fail-open nulls — never whole-batch null/throw; frozen
  `BatchAccountsClient.getMultiple`); multi-chain Alchemy
  (`EVM_CHAIN_TRANSPORTS`: ethereum/base/bsc/arbitrum/polygon/
  optimism/unichain subdomains; frozen `ChainRpc.getCode`/
  `getTransactionCount`/`ethCall(chain, ...)` with AbortSignal;
  single-arg `getCode(address)` mainnet form kept for the backend
  prober); NEW `MulticallService.tryAggregate` (Multicall3
  `0xcA11…CA11`, per-call ok passthrough, aggregate miss → parallel
  per-call fallback, unsupported chains all-false; frozen
  `MulticallClient`); FluxRPC `getAccountInfo` base64 beside
  jsonParsed. QPS budget assumptions in code comments.

- **No-negative-cache + `nullReason` counter (dexter plan todo 19a,
  robust-nulls S):** pending snapshots are NEVER cached at any of
  the three writers — `AddressSnapshotService` skips `cache.set` on
  `status: 'pending'` (no short-TTL fallback needed: the store
  honors any TTL), the edge `CacheInterceptor` skips `status:
'pending'` bodies, and `CacheService.getOrSet` takes a `shouldCache`
  gate the batch edge sets to "not pending" (default preserves
  always-write for other callers). The P12 repeat now re-touches
  providers (`x-cache: MISS`) instead of serving a frozen HIT.
  History still persists pending rows (19b SWR reads them). New
  `SnapshotNullMetricsService` counts the miss flavor
  (`no-market`/`transient`/`cached`, derived never stored; metric
  only — no cron, no scan; runbook line in AGENTS).

- **Pair-side attribution fix (dexter plan todo 20, root fix for
  the USDC→PUMP mislabel):** `DexScreenerPairSummary` now carries
  BOTH `baseToken` and `quoteToken` (`toPairSummary` plumbs the
  quote side, null-safe when the pair carries none) and the
  dexscreener quote fetcher side-verifies identity — the requested
  mint must equal one side's address (case-insensitive) and that
  side's symbol/name wins; a pair with our mint on neither side is
  discarded (null, never throws). Repo-wide `baseToken` audit:
  geckoterminal (`getTokenInfo`) and birdeye (`getTokenOverview`)
  query per-address endpoints (mint-bound by construction, no
  change); backend `dexscreener.adapter` + `ticker-resolver`
  excluded by design (other app, other plan). The legacy
  cross-chain `getBestPairSummary` is `@deprecated`
  (side-unverified; kept working, no new callers). Liquidity pick
  untouched. Failing-first:
  `provider-quote-pair-side.spec.ts` (plumbing both modes +
  quote/base/neither-discard/case-insensitive); `cascade-order` +
  `supply` + `chain-honest` stubs now carry side addresses.

- **Chain-honest snapshots (dexter plan todo 18, root fix for
  fabricated multi-chain ties):** `DexScreenerService` gains
  `DEXSCREENER_CHAIN_SLUGS` (our 6 chain ids map 1:1 to DexScreener
  slugs, verified live; unmapped chain resolves `null` with zero
  network traffic) + `getBestPairSummaryForChain(chain, address)`
  (strict: chain-scoped `GET /token-pairs/v1/<slug>/` + STRICT
  `chainId` filter + best-liquidity pick; chain with no pair
  resolves `null`). Also fixes `getPairsByChain`, which read
  `data.pairs` off an endpoint that answers a bare pair array (was
  always `null` — dead code). The dexscreener quote fetcher (now all
  6 chains) + `snapshot.venue` use the strict path; the legacy
  cross-chain `getBestPairSummary` is untouched for bare callers
  (dual modes pinned in `address-snapshot-chain-honest.spec.ts`).
  Live `:4165`: `0xFf81…8583d6` resolves on base (ready, venue
  baseline) and honest `pending`/nulls on ethereum + bsc.

- **Snapshot DEX venue for the dexter venue-line (plan todo 14):**
  `DexScreenerPairSummary` carries the best-pair `labels` (was
  already returning `dexId` — labels were dropped at the summary
  seam); `AddressSnapshot` gains live-resolved `venue?
{dexId, labels}` (same lifecycle as `launchpad`: resolved per call
  via the injected `DexScreenerService`, never persisted to history,
  never throws) and the compat edge `GET /api/market-data/snapshot`
  exposes it. Coexists with `launchpad` — the two resolve
  independently and are never mixed.

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
