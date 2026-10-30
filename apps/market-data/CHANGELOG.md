# Changelog

All notable changes to `@onchain-bot/market-data` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **pump.fun bonding curve on the wire + DexScreener 5-minute bucket
  (`rick-compact-card` §10.16, 2026-10-30):** dexter's launchpad
  short-card layout. `AddressSnapshot.bondingCurve` is a new REQUIRED
  key (`BondingCurveInfo | null`, LIVE-ONLY): `{ onCurve: true,
launchpadId, quoteSymbol, quoteMint, progressPercent }` when the
  classic `[b"bonding-curve", mint]` account decodes as
  NON-graduated, else `null` (never `onCurve: false`). Fast path
  reuses the curve-PDA view it already reads (ZERO added network);
  fan-out runs `getPumpCurve` once, gated to Solana `kind=token`,
  bounded by `SNAPSHOT_PUMP_CURVE_TIMEOUT_MS` (default 1500,
  fail-open); SWR-now / stale / invalid / background-refresh pin
  `null` (accepted layout flip; persisting the curve would need a
  jsonb column). The codec now zero-pads to the append-only 166 B
  layout (`creator` @49, `quoteMint` @83, both length-gated), and
  progress is a pure clamp
  `100 × (1 − realTokenReserves / 793.1e12)` at 4 dp — denominator
  is the initial 793.1M reserve, never `tokenTotalSupply`. New
  `PumpQuoteResolver` (WSOL/zero ⇒ zero reads; Token-2022 TLV
  `type 19` → Metaplex metadata → `null`, still emitting the read
  `quoteMint`) with a cap-500 definitive-only cache; `pumpView` leg B
  now uses the REAL quote mint + decimals, fixing `priceBA` for
  token-quoted curves (served price still from DexScreener/Meteora,
  never mixed). DexScreener's four 5m fields
  (`volume5mUsd`/`priceChange5m`/`txns5mBuys`/`txns5mSells`) come from
  the `dexId === 'pumpfun'` pair via new
  `selectPumpfunPairForSlug` (unsorted, explicit), written ONLY by the
  `dexscreener` fetcher behind a USD/SOL quote-CLASS gate (the
  reference mint's `Bitcoin` quote ⇒ all four `null` ⇒ silent row; a
  real `0` survives; partial `txns.m5` nulls both sides), riding ONE
  extra Solana-only `getPairsByToken` promise started concurrently
  with discovery (zero added wall-clock, ≤1 call; zero calls on other
  chains). Both pair→summary mappers stay byte-parity. Compat edge
  whitelist carries the five keys explicitly (batch surface
  untouched), pinned by an exact 47-key sorted array. PREREQUISITE
  FIX: `solana-pda.ts` had wrong `ED25519_D`/`ED25519_SQRT_M1`
  constants — every derived PDA was wrong, silently poisoning
  `getTokenBasics` identity and the launchpad detector; corrected and
  pinned with 5 absolute web3.js vectors (11/11). Suite 168/1437
  green, `tsc --noEmit` clean.

- **Holder concentration (`holderConcentration`) — the `👥 TH:` source
  (2026-10-26):** new REQUIRED `AddressSnapshot.holderConcentration`
  (`{ topPercents, top10Percent } | null`, always emitted) produced by a
  dedicated `solana-holders` quote fetcher (position 5, right after
  `solana-rpc`; tier `free`; Solana-only — no keyless per-wallet EVM
  source exists) that emits ONLY that field. Denominator is on-chain
  TOTAL supply; `getTokenLargestAccounts` ATAs are decoded through the
  existing token-account decoder and summed per WALLET in BigInt; zero
  amounts dropped; four exclusions applied BEFORE the sort/cut
  (uninitialized ATA, System-Program burn owner, wallet account `null`,
  program-owned wallet) so `sum(top5) <= top10` holds by construction;
  `topPercents` = first `min(5,n)`, `top10Percent` = first `min(10,n)`.
  Guards: zero/null supply, non-finite, top-10 outside `[-ε, 100+ε]` →
  `null` (inside → clamp `[0,100]`); zero eligible wallets → `null`
  (silence). Lower-bound caveat documented (≤20 accounts) and it is a
  DIFFERENT metric from the legacy `top10HolderPercent` (per account,
  pool-inclusive, no exclusions). Compat edge whitelist carries the key
  explicitly; the reduced batch surface stays untouched. Kill-switch
  `SNAPSHOT_HOLDER_CONCENTRATION_ENABLED` (default on).
  **Budget calibrated 1500 → 3800 ms** through
  `SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS`: the leg is four SEQUENTIAL
  rounds and the keyed Helius primary answers `getTokenLargestAccounts`
  in 2360–2936 ms (`n=20`), so the whole path measures 3.15–3.70 s —
  1500 sat below the band and every pre-change live card read `null`
  (the public endpoint 429s that exact method). A new spec pins
  `DEFAULT < SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT` (4000 ms, the
  backstop). First live row (dev, BONK cold serve 3.507 s):
  `[8.8307, 6.7930, 3.6205, 3.0550, 3.0424]` / top-10 `38.2367`.
  `.env.example` now declares both switches with their defaults.
  Suite 164 / 1358 green, `tsc --noEmit` clean.

- **GeckoTerminal pool 1-hour bucket (2026-10-26):** Gecko-only tokens
  (`/info` complete, no DexScreener pair) now render dexter's `1H` row.
  `selectPoolQuote` harvests `volume_usd.h1`, `price_change_percentage.h1`
  (BASE-SIDE only, same rule as the 24h bucket) and `transactions.h1`
  (WHOLE-PAIR — absent or either side non-finite nulls BOTH, never a
  `{0,0}` default) from the SAME pool pick the OHLC-derivation leg
  already fetches, so the harvest pays ZERO extra HTTP calls.
  `GeckoPoolQuote` gains `volume1hUsd` / `priceChange1h` / `txns1hBuys` /
  `txns1hSells` (real `0` survives; absent/non-finite is `null`);
  `VenueMarketReading` + `applyVenueMarketFields` carry and fill them
  null-only (a native value is never overwritten, the txns pair is never
  half-filled or mixed across sources), `applied` now covers the seven
  quote fields, and `sources` still names `geckoterminal` exactly once.
  The frozen `SnapshotQuote` wire contract is unchanged. Specs:
  `geckoterminal-pool-1h.spec.ts` (8) + extended venue-market
  unit/integration pins; suite 161/1307 green, `tsc` clean.

- **DexScreener 1-hour bucket on the snapshot quote (2026-10-26):** four
  new nullable fields — `volume1hUsd`, `priceChange1h`, `txns1hBuys`,
  `txns1hSells` — carried pair-level (never summed with other buckets;
  the pre-existing `volume24h` bucket-sum oddity is deliberately
  untouched and spec-pinned). `DexScreenerPairSummary` gains
  `volume1hUsd` / `priceChange1h` / `txns1h` with BOTH mappers kept in
  byte-parity (`toPairSummary` in `dexscreener.service.ts` and
  `toSummaryFromTripwire` in `discovery-cache.service.ts`): absent or
  non-finite → `null` (never `0`; a real `0` survives), and a
  partial/non-finite `txns.h1` nulls the WHOLE object — absence must
  silence downstream instead of rendering a `{buys:0,sells:0}` default.
  `SnapshotQuote` + `SNAPSHOT_QUOTE_FIELDS` + `emptySnapshotQuote`
  carry the four; the dexscreener quote fetcher is the ONLY writer
  (other legs emit no key); `selectPreferredQuote` in
  `evm-tolerance.ts` passes them through the direct/aggregator merge so
  the fast path cannot drop them; the compat edge whitelist exposes
  them. Consumers: dexter's derived `{{market1hRow}}`. Specs:
  `dexscreener-summary-1h.spec.ts` + `provider-quote-1h.spec.ts` +
  gateway key-set pin; suite 160/1295 green, `tsc` clean.

- **Gecko-only market parity: pool market fields + launchpad hint +
  ATH-seed 429 backoff (dexter plan todo 72, 2026-10-21).** Tokens whose
  GeckoTerminal `/info` is complete (the usual pump.fun case) now serve
  `liquidityUsd`, `volume24hUsd`, `priceChange24h`, `pairCreatedAt` and
  `launchpad` instead of four nulls plus a bare venue.
  `GeckoPoolQuote` gains `liquidityUsd` (from the pool's
  `reserve_in_usd`, only when `> 0` — a zero reserve is "not measured",
  never a zero liquidity), `volume24hUsd` and `priceChange24h` (real
  `0`s preserved, never nullished), and `poolCreatedAtMs`
  (`pool_created_at` ISO → ms); `priceChange24h` is side-gated to the
  base side (a pool quoting our mint cannot attribute its own change).
  `GeckoTerminalTokenInfo.gtCategoryIds` carries `gt_category_ids`
  (trimmed, blanks dropped) and the fetcher writes the first id into a
  NEW dedicated `geckoLaunchpadHint` field — one writer, but listed in
  `SNAPSHOT_QUOTE_FIELDS` so the merge actually carries it (precedent:
  `dexscreenerFdvUsd`). The derivation seam harvests the pool pick
  `acquireDerivationCandles` already fetched (zero extra calls): a
  non-null pool change short-circuits before the hourly OHLC call, and
  the harvested market fills the quote null-only via the new pure
  `snapshot/domain/snapshot-venue-market.ts` (a native `0` or another
  provider's value is never overwritten). `pairCreatedAt` falls back to
  the Gecko pool creation time (closing the todo-63 "Gecko-only → null"
  caveat) and `sources` gains `geckoterminal` once when the fill
  applies. The launchpad hint is a LAST resort applied after the tail
  loop: detector positive wins, allowlist starts at `pump-fun`, gated to
  `solana` + `kind=token`, re-validated through `launchpadInfo`, never
  derived from the `...pump` suffix. ATH seeding now pauses 60s per
  token after a `429` (`AthSeedTransientBackoff`), checked after the 6h
  definitive memo and written only for `RetryableProviderError` with
  `status === 429` — 5xx/timeouts keep retrying fail-open.
  `resolveVenue`, `needsPool` and the native-wins precedence are
  untouched. Specs: new `address-snapshot-venue-market.spec.ts` (11),
  `snapshot-quote.types.spec.ts`, plus extended Gecko/fetcher/venue
  suites (157 suites / 1198 tests).

- **Production deploy lane (DORMANT) + staging 7-day soak tooling:**
  new `.github/workflows/deploy-market-data-prod.yml` (push `master`
  on `apps/market-data/**` plus `workflow_dispatch` lanes `full` /
  `rollback-market-data-prod`; multi-arch build; `.env.production`
  precondition aborts before any mutation; unique container-name hosts
  for the DB one-offs; health `:4002`; `:prod-prev-market-data` pin
  only after a healthy deploy; auto-rollback only after smoke starts)
  and `apps/market-data/docker-compose.prod.yml` (project
  `onchain-bot-market-data-prod`, app `:4002`, pg `:5449`, redis
  `:6396`, `onchain-bot-net` plus the `onchain-bot-market-data` alias
  used by dexter prod and the frontend nginx). The lane is dormant
  behind the Wave 4 owner gate and nothing was dispatched. New
  `scripts/market-data-soak-check.sh` (read-only JSONL daily probe) and
  `docs/deployment/market-data-staging-soak.md` (7-day routine for
  todo 8). Docs: todo 3 is marked SUPERSEDED by P45 (plan line 94, do
  not execute) — aggregators, persistence and batch already exist.

- **Staging deploy lane + TypeORM CLI tooling:** new
  `.github/workflows/deploy-market-data-staging.yml` (push `dev` on
  `apps/market-data/**`; multi-arch `linux/amd64,linux/arm64` build to
  `ghcr.io/<repo>-market-data:${{ github.sha }}` + `:staging-latest`;
  self-provisioning full-tree rsync; operator-owned `.env.staging`
  protected by `--exclude='.env*'`; DB backup + dry-run
  `migration:show`/`SELECT 1` + `migration:run` in a `--target builder`
  one-off; recreate + health `:4001`; pin `:staging-prev-market-data`;
  dispatch-only rollback lane). New
  `src/shared/database/data-source.ts` (explicit entities + migrations,
  relative imports, `migrationsTableName: typeorm_migrations`) plus
  `typeorm` and `migration:generate|run|revert|show` scripts.
  `docker-compose.staging.yml` now pins `DATABASE_ENABLED: "true"` and
  addresses pg/redis by unique container-name hosts (Docker DNS alias
  collision class); the staging env template matches.

- **Honeypot tail budget — dedicated slow-leg deadline (todo 71
  follow-up):** the honeypot extra is now OUT of the shared 400ms
  extras budget. New env `SNAPSHOT_HONEYPOT_TIMEOUT_MS` (default 1500;
  `resolveHoneypotTimeoutMs` + `SNAPSHOT_HONEYPOT_TIMEOUT_MS_DEFAULT`
  in `snapshot-honeypot.ts`, the `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS`
  precedent — non-finite/≤0/garbage → default, `Math.floor`) is read
  once at construction and governs ONLY the `tail:honeypot` wait;
  venue/dev keep the shared 400ms `SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS`
  byte-identical. The generic timeout note now prints the REAL budget
  used (`timeout (tail budget 1500ms) — degraded to null, fail-open`;
  launchpad keeps its detector-budget note). Motivation: the live
  GoPlus RTT (~389ms lane-time, RE-MEASURED 428–467ms the same day,
  todo 71) always lost the 400ms race, so cold serves degraded on
  `tail:honeypot` and the reading landed only on the refresh/repeat.
  NOTHING else changes: gate, kill-switch, memo, fast-path skip,
  concurrency 3 and the transient note are identical. Specs: resolver
  cases (default/override/garbage) + fake-timer window pins (survives
  500ms, settles past 1500ms with the real-budget note; env override
  note pin) + updated timeout pin + tail budget pin — full suite
  154/1161 green ×2, `tsc --noEmit` clean. Evidence:
  `.omo/evidence/task-fe-honeypot-research/slow-leg-budget-lane.log`.

- **Honeypot leg — GoPlus Fase 1 (dexter plan todo 71):** address
  snapshots carry `honeypot: {buy, sell, sim} | null` (% 0-100, fraction
  strings ×100; `sim` always `null` in Fase 1 — honeypot.is/SIM
  explicitly deferred). The field is REQUIRED on `AddressSnapshot`
  (always emitted; `null` = no source/reading; dexter's
  `toHoneypotOrNull` treats null/absent identically) and the compat
  snapshot controller whitelist carries the explicit `honeypot` key.
  Provider (`src/provider/infrastructure/goplus/`): keyless plain
  `@Injectable` `GoplusService` (no registry descriptor —
  `ProvidersModule` untouched): `GET /api/v1/token_security/{chainId}`
  ONE address/request, 2s axios timeout, NEVER throws
  (transport/HTTP/parse → `{kind:'transient'}`); chain scope
  ethereum/bsc/base only. Domain (`snapshot-honeypot.ts`, pure):
  body-is-truth classifier — `code:2022` → definitive absence;
  `code!==1`/non-record → transient; entry absent → definitive; entry
  present → reading (`buy_tax`/`sell_tax` fraction ×100 via
  `Math.round(x*100*1e4)/1e4`; absent / non-numeric / outside 0-100 →
  that side `null`, never 0, never clamped). TAIL: FOURTH extra
  (`kind: 'honeypot'` after `dev`, SAME shared 400ms budget;
  concurrency stays 3 — the 4th queues into a second wave); gate
  `token && !skipHoneypot && SNAPSHOT_HONEYPOT_ENABLED && goplus &&
mapped chain` (unmapped chain / non-token kind → no call, no note,
  no bit); transient ⇒ absent + `degraded` + `tail:honeypot` note
  (timeout keeps the shared 400ms text); a responding source emits
  `{buy, sell, sim:null}` even with both sides null ("probed, no data"
  ≠ "no source"). NEGATIVE MEMO: bounded 500 / TTL 6h, DEFINITIVE
  absences only (transients retry next request). FAST-PATH:
  `skipHoneypot=true` → absent + `degraded` + `honeypot:fast-path`
  (same semantics as `dev:fast-path`); unmapped chain stays silent.
  TTL policy: additive `'honeypot'` class (30s card-class). Kill-switch
  `SNAPSHOT_HONEYPOT_ENABLED` (default ENABLED). Witnesses live on dev
  `:4000` (2026-10-19): SAFEMOONCASH bsc `{buy:4,sell:2,sim:null}`
  (fractions `0.04`/`0.02`), PEPE ethereum `{buy:0,sell:0,sim:null}`,
  CAKE bsc `{buy:null,sell:null,sim:null}` (entry present, tax keys
  absent), NYMA robinhood `null` zero notes (unmapped chain). LATENCY
  DATUM: direct GoPlus ~389ms at lane time; RE-MEASURED later the same
  day 428–467ms (upstream variance; `code:5000 "system error"` seen
  for some tokens) — while the RTT sits over the 400ms budget the leg
  degrades honestly (`tail:honeypot` timeout/transient note) and the
  reading lands when the race is won (no design change — budget per
  plan; a dedicated slow-leg budget is an owner-decision follow-up).
  Specs: `snapshot-honeypot` + `goplus.service` +
  `address-snapshot-honeypot` (10 integration) + TTL-policy pins; 5
  module-boot specs got hermetic `GoplusService` overrides — 154
  suites / 1156 tests green ×2 (baseline 151/1111), `tsc --noEmit`
  clean. Evidence:
  `.omo/evidence/task-fe-honeypot-research/market-data-lane.log`.

- **Latency package — SWR-now + existence gate + race deadlines +
  pending aging (dexter plan todo 21):** Rick-style <1s budget in four
  fail-open pieces on the existing pipeline (19a/19b1/19b2/19b3/41
  invariants intact). Serve order: cache HIT → SWR-now → existence
  gate → gated fan-out race → pending aging. **(a) SWR-now:** a
  `ready` history row aged in [`SNAPSHOT_SWR_MIN_AGE_MS` 30s = the
  numbers TTL, `staleMaxAgeMs` 24h) serves immediately (`swr-now`
  audit note, stale trio from the row, `launchpad`/`venue`/
  `pairCreatedAt` null, `fdvAth` from history only, `sources` copied;
  never cached; clears aging) and starts a deduped background
  refresh (`SingleflightService.has` + separate `refresh:<cacheKey>`
  key): regular serve minus SWR, `allFailed` = TOTAL no-op, no
  `observeGovernor`, success persists + caches 30s (repeat <100ms),
  `missing` persists invalid; `backgroundRefreshHandle()` is the
  handle seam. **(b) Existence gate** (`AddressExistenceService`,
  NEW; before fan-out — zero quota burn; only `token`/`unknown`
  kinds): EVM `eth_getCode` over the tiered transport (empty +
  token → `missing` `no contract bytecode (eth_getCode returned
empty)`; empty + unknown → zero-nonce check), Solana
  `SolanaRpcService.probeAccountExistence` (`value: null` →
  `missing`); `unresolved` (unknown chain/format/gap/800ms
  `SNAPSHOT_EXISTENCE_DEADLINE_MS`) fails open. `missing` →
  new `status: 'invalid'` card (`providerErrors.existence`,
  all-null quote, `assetId: null`, `sources: []`) persisted +
  cached 30s. **(c) Race deadlines:** `aggregate(...,
{deadlineMs})` abandons stragglers at `SNAPSHOT_FANOUT_DEADLINE_MS`
  (default 4000) with `abandoned at fanout deadline (<ms>ms) —
fail-open` records; resolved values still merge; per-fetcher 8s
  bound intact. **(d) Pending aging** (`PendingAgingService`, NEW):
  `SNAPSHOT_PENDING_AGING_N` (3) consecutive pendings within
  `SNAPSHOT_PENDING_AGING_WINDOW_MS` (600s) per
  `(chain,address,kind)` escalate to `invalid` (+`aging` note);
  entry KEPT (re-escalates, count grows); gap/backwards-clock resets
  to 1; cap 1000; refresh never records; cleared by fresh ready /
  SWR / existence-missing / stale-floor. Latent DI gap found +
  fixed: union-typed ctor params without `@Inject` emit `Object`
  metadata (strictNullChecks) — the service `cache` param was
  silently `undefined` since inception (service cache inert, also
  under `nest build`); now `@Inject(CacheService)` (required for the
  refresh cache-warm; `assets`/`nullMetrics` remain documented-latent,
  NOT changed). Per-stage spans are log-only (`swrMs`/`existenceMs`/
  `directMs`/`fanoutMs`/`tailMs`/`totalMs`). Measured live (dev
  `:4000`): NYMA `0x968B…` cold ready 2.99s, repeat 2.9ms, SWR at
  33.3s age 3.5ms + refresh, post-refresh service-cache repeat
  1.9ms, dead address invalid 453ms with the existence reason, no-data
  contract pending 2.7s then aging-escalated invalid on the 3rd call.
  Specs: `snapshot-latency.spec.ts`, `address-existence.service.spec.ts`,
  `snapshot-aggregator-deadline.spec.ts`,
  `address-snapshot-swr.spec.ts` (5),
  `address-snapshot-existence.spec.ts` (7),
  `address-snapshot-aging.spec.ts` (7),
  `address-snapshot-rick-parity.spec.ts` (2) — 151 suites / 1111
  tests green (baseline 144/1034), dexter 69/721 green,
  `tsc --noEmit` clean. Evidence:
  `.omo/evidence/task-fe-latency.log`.

- **Breaker single failure path — registry relay (dexter plan todo
  19b3):** `ProviderRegistryService.recordFailure(name, reason?)` is now
  the ONE failure writer — it ticks its telemetry counters (gateway
  `listStatus`, unchanged) AND relays every failure except the exact
  `'no data'` marker into the shared `CircuitBreakerService` under
  `snapshotBreakerKey(name)` (`snapshot-fetcher:<name>`), the SAME key
  `AddressSnapshotService.applyBreakerGate` reads (`canExecute ===
false` removes the fetcher with an explicit skip note — fail-open,
  never throws). `AddressSnapshotService` no longer writes the breaker
  directly on the failure side — the `'no data'` blind-spot guard, the
  unknown-name descriptor parity skip and the `breaker open` warn log
  moved into the registry (its failure loop is now one call:
  `providers.recordFailure(name, outcome.errors[name])`). Success side
  stays direct at the snapshot seam (contributed + idle-success —
  documented asymmetry: idle-success has no registry counterpart). Key
  definition moved to
  `shared/infrastructure/rate-limiter/domain/snapshot-breaker-key.ts`
  so relay + gate share ONE definition (the registry cannot import the
  snapshot service — cycle); re-exported from
  `address-snapshot.service.ts` for compat. Thresholds UNCHANGED
  (defaults 5 consecutive failures → 30s cool-off; memory store +
  reset-on-deploy accepted; flapping = fixed cool-off, no adaptive
  backoff). Specs: 5 new relay specs in
  `provider-registry.service.spec.ts` (relay opens, `'no data'` never
  relays, missing reason counts, unknown-name parity, no-breaker
  telemetry-identical), the registry↔breaker DI wire in
  `provider.module.spec.ts`, and the `address-snapshot-breaker.spec.ts`
  acceptance set now runs against the REAL registry (open / close /
  half-open-single-probe / flapping / no-data-neutral /
  unknown-name-parity). 144 suites / 1034 tests green (baseline 1028;
  +6), `tsc --noEmit` clean. Evidence:
  `.omo/evidence/task-fe-breaker.log`.

- **One-shot historical FDV-ATH seed — keyless GeckoTerminal `ohlcv/day`
  (dexter plan todo 68, owner decision 2026-10-18):** on a token's first
  sight (marker `geckoterminal-ath-seed` absent on any of its history
  rows — NOT `ath === null`, which the todo-46 hour backfill masks
  forever) the pipeline makes ONE keyless
  `GET /networks/{slug}/pools/{pool}/ohlcv/day` call (params
  `aggregate=1&limit=100&currency=usd&token={base|quote}`) through the
  NEW `GeckoTerminalService.getPoolOhlcvDay` (own 2s axios timeout, caller
  `withTailBudget` 2s) and seeds exactly ONE row: peak day candle,
  `fdvAth = max(high) × supply` (`totalSupply ?? maxSupply`,
  `fdvProvenance: 'computed'`), `status: 'ready'`, `priceUsd` = peak
  high, `createdAt` = candle open + 1ms (distinct from a todo-46 hourly
  row at the same midnight under `unique(key, createdAt)`). Peaks older
  than the 90d janitor retention are SKIPPED (100 day rows ≥ 90d; no
  seed rows outside the surviving window). `findFdvAth` now returns
  `{ath, seeded}` (`FdvAthLookup`); the seeded row participates in
  `findFdvAth`/`findAnchorAt`/the `findLatestReady` stale floor like any
  coherent ready sample (no query changes; SWR age binding unchanged —
  spec-pinned). Served-only CLAMP: `fdvAth` never displays below the
  in-flight FDV (live value + `at = now` when the peak is being set
  live; history never rewritten; `null` never invented). PLUMBING
  (todo-63 anatomy, ZERO extra calls): `pairAddress` + `pairSide` ride
  the fast-path discovery summary / the venue tail's DSC best summary
  (DSC `pairAddress` IS the GT pool id; side from
  `baseToken`/`quoteToken` addresses) or the Gecko venue fallback's
  `pick.poolAddress`/`pick.side`. FAIL-OPEN TOTAL: 429/401/404/[]/timeout
  → no seed, card unaffected, never a throw; in-process negative memo
  (bounded 500, TTL 6h) memoizes DEFINITIVE absences only — transient
  classes (429 incl. headerless, 5xx, timeout) retry next request.
  Guards (0 calls): non-token kind, Gecko-unsupported chain, empty pool
  id, unknown side, supply null/≤0, legacy stubs without the method.
  Kill-switch `SNAPSHOT_ATH_SEED_ENABLED` (default enabled) +
  `SNAPSHOT_ATH_SEED_DAYS` (default 90, cap 180). Semantics evidence:
  max(close) rejected (CHALE −64% vs Rick), max(high) within Rick's
  documented anti-spike band (+8..+43%) —
  `.omo/evidence/task-fe-ath-backfill-ext.log`. Attribution: on-chain
  data provided by GeckoTerminal. Specs:
  `address-snapshot-ath-seed.spec.ts` (22),
  `geckoterminal-ohlcv-day.spec.ts` (9), `findFdvAth` marker pins in
  `address-snapshot-fdv-ath.spec.ts`; flake-class hardening
  (Gecko/Birdeye/fast-path stubs) in the fast-path, service,
  computed-fdv, identity-provenance, chain-honest and gateway specs.
  Evidence: `.omo/evidence/task-fe-ath-seed.log`.

- **Best-pair age proxy on the snapshot (dexter plan todo 63):**
  `AddressSnapshot.pairCreatedAt: string | null` (TOP-LEVEL, after
  `venue`) carries the best-liquidity pair creation time for dexter's
  derived `{{age}}`. `DexScreenerPairSummary.pairCreatedAt: number |
null` is mapped by BOTH `toPairSummary` and `toSummaryFromTripwire`
  under the SAME guard (`finite && > 0`, else `null` — byte-parity
  pinned); `resolveVenue` returns `{venue, pairCreatedAtMs}` (tripwire
  hit → the live pair's value, miss → the discovery best; the
  GeckoTerminal fallback leg carries no creation time → `null`, no
  extra fetch) and the Solana fast path threads
  `DirectFastPathResult.pairCreatedAt`; `buildSnapshot` converts raw
  ms → ISO ONCE (`toIsoPairCreatedAt`, non-number/non-finite/≤0 →
  null) into BOTH snapshot literals; the controller exposes it. ZERO
  new HTTP calls (existing call-count specs pass unchanged); history
  rows untouched. PAIR age proxy, NOT token deploy age — a migration
  under-reports (caveat documented). Specs: tripwire mapping,
  fast-path threading, venue plumbing (absent → null; `1791892874000`
  → `2026-10-13T12:01:14.000Z`), fast-path handoff ISO, gateway edge
  (`pairCreatedAt: null` on pending shells + ISO plumbing), mapper
  guard (0/NaN → null). Evidence: `.omo/evidence/task-fe-age.log`.

- **Flapsh-pair launchpad corroboration — keyless `flap` upgrade (dexter plan todo 60):**
  presence of a pair with `dexId: 'flapsh'` in the token's DexScreener
  pair list (`/latest/dex/tokens/<mint>`, quote side included) now
  corroborates launchpad `flap` on BSC ONLY when NO detector positive
  exists. Precedence pinned: dexter override (rank 1, untouched) >
  detector-positive > flapsh-corroborated > null. Presence-only
  (research 57 caveat a: absence is NEVER negative evidence —
  flapsh-less Flap tokens resolve null honestly, nulls never cached);
  era ≥2026-09-29 documented (caveat b); stock-paired empty pairs
  valid (caveat c); pair-list read without a `baseToken.address ==
mint` requirement (caveat d); platform-level Flap corroboration
  (caveat e). ONE concurrent keyless DSC leg inside the detector's
  shared deadline (Phase-2 factory-miss, `bsc` gate, `chainId` filter
  = chain honesty); positive corroborations ride the existing flap
  positive cache. Specs: `launchpad-detector-flapsh.spec.ts` (18 —
  WENCAT/Froggie/stock-paired positives; fourmeme/CAKE negatives;
  absence-no-negation; era; chain honesty; precedence; deadline/abort;
  cache). Evidence: `.omo/evidence/task-fe-flapsh-leg.log`.

- **Null-only DexScreener FDV fallback — provenance-tagged (dexter plan
  todo 61):** the single computed-FDV seam
  (`applyComputedFdv`/`buildSnapshot`) now serves
  `fdvUsd = computedFdvOf(...) ?? sane(dexscreenerFdvUsd)` — the
  DexScreener pair `fdv` fills the value ONLY when the computed product
  is null, from a DEDICATED quote field (`dexscreenerFdvUsd`) written
  by the `dexscreener` fetcher alone (the generic merged `fdvUsd` can
  never feed it — Gecko lesson: INCOME-class reporteds with foreign
  supply bases stay structurally out). A healthy computed product wins
  ALWAYS: WENCAT/INCOME cards byte-identical, the Solana fast path
  (no DSC payload) unchanged; fallback guard reuses the product-guard
  vocabulary (finite, > 0; no new validation). `FdvProvenance` extends
  to `'computed' | 'dexscreener'` (`'computed'` never reused for a
  reported value; `isComputedFdvProvenance` validates the whole union —
  only `null` is pre-seam); computed-null + no DSC keeps `'computed'` +
  null.
  No migration (jsonb). ATH keeps max-all with NO query change —
  only-fallback tokens still accrue `fdvAth` (docstrings extended in
  `snapshot-fdv-ath.ts` + the history repository). Verified live
  (2026-10-17): DSC SCRIP fdv 2653 = price × RPC supply 2652.34
  (0.025% display rounding); WENCAT computed 21020 vs DSC 21040 never
  swapped while healthy. Specs: provenance matrix (computed-win /
  fallback / both-null / garbage-fallback / Gecko-lesson) + fixtures
  SCRIP, WENCAT, JUP-like. Evidence:
  `.omo/evidence/task-fe-fdv-fallback.log`.

- **Keyed OHLC fallback — Birdeye token-level candles (dexter plan todo 55):**
  three keyed doors probed once each (≥8s spacing; key values read by
  NAME at runtime, never echoed): Moralis `/erc20/metadata` → HTTP 401
  (Free plan paused — todo-27 suspicion confirmed; no extension), Mobula
  OHLC backup → HTTP 403 (Free plan; moot), Birdeye `/defi/v3/ohlcv` →
  HTTP 200 → WIRED. The todo-33/46 derivation+backfill pipeline gained
  a keyed second rung: Gecko pool route stays first/keyless and
  unchanged; ONLY a candle-less Gecko answer (WENCAT class — no indexed
  pools) escalates to `BirdeyeService.getTokenOhlcv` (`type=1H`,
  `x-chain`, epoch-second window = 26h = 24h + ±2h anchor tolerance).
  Rows normalize to the verbatim `[ts,o,h,l,c,v]` Gecko tuple; honest
  per-source provenance (`birdeye-ohlcv` vs `geckoterminal-ohlcv`)
  threads through seeds + sources. 404→null, malformed rows skipped,
  keyless/unmapped zero-network, 19b2 transient surfacing, native-wins
  precedence intact, pre-55 branch fidelity preserved (picked-but-empty
  Gecko still attempts the history anchor; no-pick/throw dead ends skip
  as before). Specs: `birdeye-ohlcv.spec.ts` (5) +
  `address-snapshot-ohlcv-backfill.spec.ts` (38 total, +5). Evidence:
  `.omo/evidence/task-fe-keyed-smokes.log`.

- **EVM on-chain supply leg — `eth_call` totalSupply + decimals (dexter plan todo 54):**
  new `evm-rpc` quote fetcher reads ERC-20 `totalSupply()` (`0x18160ddd`)
  - `decimals()` (`0x313ce567`) in ONE Multicall3 `tryAggregate` across
    the 8 multicall-verified chains (ethereum/base/bsc/arbitrum/polygon/
    optimism/unichain/robinhood), normalized BigInt-first
    (`ui = uint256_raw / 10^decimals`; `decimals >255` | null → `null`;
    revert/empty/short raw → `null`; fail-open, never throws). Last FREE
    leg (after defillama, before keyed — zero-cost invariant intact);
    keyed legs untouched, geckoterminal still wins when it carries supply.
    Proxy-safe by construction (reads execute the token's own code — the
    delegatecall target for EIP-1967/UUPS/Beacon proxies — no slot
    arithmetic); registry: deliberately not a `DEFAULT_PROVIDERS` row
    (`onchain-direct` precedent). Emits ONLY `totalSupply` — computed-FDV
    seam (todo 38) untouched, `circ` never feeds FDV. WENCAT live: 1e27 /
    10^18 = 1,000,000,000 (DexScreener fdv 14029 / price 0.00001402
    corroborates). Specs: 18-test host spec + `rawAmountToUiAmount` codec
    unit block; AGENTS "EVM ON-CHAIN SUPPLY (todo 54)". Evidence:
    `.omo/evidence/task-fe-ethcall-supply.log`.

- **CoinGecko supply transport, no price-gated discard (dexter plan todo 47):**
  `getTokenContractInfo` no longer null-collapses when price AND mcap
  are both null — supply-only rows (`total/circulating/max`) now ride
  the existing fetcher mapping into the first-non-null merge, where the
  todo-38 seam seals `fdv = price×(total ?? max)` (invariant untouched).
  Null-collapse only when every mapped field is null (`no data`
  contract preserved); fetcher order, fan-out shape, retry, and merge
  unchanged. Quota: zero new calls (same single GET — calls/scan delta
  0). Gate case SCRIP (`sources: ['dexscreener']`, triple-null supply):
  on-chain leg 429-walled (transport, not absence), CoinGecko 404s the
  mint, Gecko pool leg carries no supply — fix targets the token class,
  specs pin the transport. EVM chain verbatim:
  Birdeye→Gecko→CoinGecko→null (on-chain leg Solana-only); mint-authority
  assumption (`current-minted ≡ total`, pump.fun fixed-supply scope) in
  AGENTS. Specs: `coingecko-supply-transport.spec.ts` (7).

- **Graduated pump.fun origin: runbook + Helius diagnosis + suffix table (dexter plan todo 48):**
  precedence pinned override > detector-positive >
  suffix-corroborated > null. (a) SCRIP runbook instantiates the
  EXISTING override flow (table + CRUD + docs already per plan;
  zero code): exact `POST /api/dexter/launchpad-overrides`
  (`mint`/`launchpadId: pump-fun`/`note`, camelCase DTO),
  `DELETE /:id` revert, `GET ?mint=` verification (dev dexter
  `:4060`; SCRIP mint `y95bhwz…cpump` from todo-47 evidence; this lane
  made zero live contact — nothing to revert). (b) Helius-leg
  diagnosis by construction with precedent numbers (INCOME window
  450534185→453388576, earliest generic ATA → null; full-tx
  429-walled twice; thresholds: genesis-depth > 100 txs → miss,
  429 > 0/fire → null, 0 retries) + owner-gated probe command;
  re-implementation closed `wontfix-medido`, leg untouched.
  (c) `...pump` corroboration-only table
  (`pump-suffix-corroboration.ts`: case-sensitive suffix,
  venue-never-participates, mandatory suffix-alone → null
  falsifier) with seam pinned (observe-only in `detectInner`
  Solana branch, verdict unchanged), renderer mismo-null (no
  low-confidence value), provenance silent-with-reason (no wire
  field, no-bit-without-value invariant). Specs (12) in
  `launchpad-detector-pump-suffix.spec.ts`.

- **OHLC backfill for 24h-window + ATH (dexter plan todo 46):**
  one-time per-pool seed on the first Gecko-OHLC encounter
  (`buildOhlcvSeedRows`: `createdAt` = candle time, `fdvUsd` =
  close x current supply via the existing `computedFdvOf` seam with
  the historical-identical-to-current approximation pinned in code,
  `quote.fdvProvenance: 'computed'` reused; idempotency via the
  existing `unique(key, createdAt)` — no guard table, no migration)
  feeding outright-24h-vs-now-live derivation (`findAnchorAt`:
  history anchor within ±2h vs merged price; candle-pure math kept
  as fallback; native-wins intact; gaps resolve null) and ATH via
  `findFdvAth`-over-backfill (no ATH logic change). Specs (33) pin
  exact math on verbatim STAGEVEIL rows + idempotency + precedence +
  gaps.

- **Flap intake (dexter plan todo 44 Phase B):** `flap` launchpad row
  (`EVM_LAUNCHPAD_ORDER` after virtuals, chain-scoped
  `https://flap.sh/<chain>/<address>` with `bsc`→`bnb` slug) +
  `EVM_FACTORY_SETS.flap` (BNB Portal `0xe2cE…C9De0` + Robinhood
  Portal `0x2660…Eb09`, verbatim from canonical docs, chains
  `bsc`/`robinhood`; xlayer/monad documented-deferred, morph
  excluded — all with reason) riding the EXISTING Phase-2
  receipt-`to` machinery (no new fetcher; SSR path rejected with
  proof) + flap positive cache on the shared `CacheService`
  (`flap:launchpad:`, 14d default, nulls never). Specs (11):
  fixture match/no-match/graduated/deadline/cache-hit +
  deferred-chain zero-fetch. Dexter mirror + DisplayMap verify in
  the dexter CHANGELOG entry.

- **Public-RPC rotation per chain (dexter plan todo 42):** the public
  tier in `AlchemyService.rpcCallForChain` + `SolanaRpcService`
  (ONE position per stack, after keyed, before honest null) rotates
  over 2-4 live-verified endpoints per chain (verified 2026-10-12;
  robinhood holds 1 — the only public endpoint in existence; unichain
  gains public coverage it lacked) with round-robin + latency-score
  decay (EMA alpha 0.3, 10% relax-to-best per read, in-memory,
  reset-on-deploy) + 5m backoff on 429/timeout (N pinned,
  `PUBLIC_RPC_BACKOFF_MINUTES = 5`). Observability on existing seams:
  `served-by=public:<host>` on success, `providerErrors` backoff
  enter/exit notes (429-flavored enters feed the governor's existing
  pressure scan; exits neutral). Keyed order untouched; QPS worst case
  grows 1 → ≤3 public attempts only when siblings are down (bounded,
  spec-pinned).

- **Free-scale: singleflight + TTL policy + governor + tail-degraded
  (dexter plan todo 41):** `SingleflightService` (N-concurrent
  same-key snapshots collapse to one upstream run; `Map` +
  `try/finally` delete + 1000-cap LRU + 15s own timeout rejecting
  adherents without poisoning; normalization IS `AddressIdVo`, no new
  function; interposed at the `getSnapshot` entry) +
  `snapshot/domain/snapshot-ttl-policy.ts` (single source of truth,
  30s default preserved; numbers 30s / identity history-bound /
  venue-launchpad live-per-call + tripwire / holders-dev 30s
  card-only with no hours-class; pending never cached; anti-hardcode
  spec fails on TTL literals in writers) + stale trio per class (one
  trio: numbers/identity/dev stale with `staleAgeMs`,
  venue/launchpad/fdvAth live even on replays; `no-bit-without-age`
  runtime-guarded) + `AddressSnapshot.degraded` (tail timeouts/skips,
  cached WITH the bit, pending/stale never) + `QuotaGovernorService`
  (ONE governor read pre-fan-out: MISS counter + breaker open-count +
  429 metric; L1 sheds Tier-2 keyed, L2 Tier-1+2, Tier-0 never shed;
  `providerErrors['governor:shed-tier-N']` audit note). Headroom math:
  Tier-0-alone saturates at ~3-20 cold scans/min vs ~2/min current —
  10x EXCEEDS, so the invariant is BOUNDED (Tier-0-only + stale +
  honest pending past ~90 MISS/min; 100x = cache-mostly-stale).
  Kill-list: none executed. Compat + batch edges carry `degraded`.

- **Identity provenance + metadata last resort (dexter plan todo 39):**
  `SnapshotQuote.identityProvenance: 'market' | 'metadata' | null`
  (assigned, never merged — absent from `SNAPSHOT_QUOTE_FIELDS`;
  jsonb key on history rows, no migration). Fast-path Solana cards
  name market-first (side-verified discovery pair, metadata only for
  unnamed fields); the `buildSnapshot` seam keeps a fast-path pin or
  fills symbol/name from ONE lazy metadata read when the merged
  quote names nothing (Solana token-kind only, 2s own budget,
  fail-open; healthy path pays zero calls). Identity-only — numbers
  stay aggregator-owned, market-less hits keep `pending` with honest
  N/A numbers. `isMutable` decoded from the metadata tail (mutable
  still resolves; the dexter `(unverified)` marker is mandatory for
  all metadata names). Program constant verified against
  `metaplex.com/docs/official-links` + live USDC metadata read.
  Token-2022: PDA path is program-agnostic (spec-pinned);
  extension-embedded names without a PDA are out of scope
  (documented). Compat edge carries the field.

- **Single-seam computed FDV (dexter plan todo 38):** the merge exit
  (`buildSnapshot`) is the ONE FDV seam — provider-reported `fdvUsd`
  never survives: `fdv = price×(total ?? max)` with the `marketCapOf`
  / `isSanePrice` / `toNumber` guard vocabulary (both finite and > 0,
  else null; `circulating` never feeds FDV). MC recoheres as
  `price×circ` when `circ` present (no MC > FDV cards); merged MC kept
  otherwise (fixed-supply MC≈FDV assumption, `marketCapOf` pattern).
  Discarded reporteds debug-logged. New history rows tagged
  `fdvProvenance: 'computed'` (jsonb key, no migration; `findFdvAth`
  max over one semantics, 90d mixed-window transient documented, no
  backfill). Pure helper `snapshot/domain/snapshot-computed-fdv.ts`
  with epsilon-invariant specs on 4 fixtures (Solana-fixed,
  EVM-vested, null-supply→null, INCOME price×total≈2689 vs reported 3016) + seam specs + edge matrix (NaN/Infinity/negative/zero →
  null); best-pick tiebreak re-verified (ranking untouched).

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

### Changed

- **Honeypot leg: GoPlus `sim` verdict + `lp_holders` LP lock + Gecko
  `pairCreatedAt` fix (dexter Rick compact card, 2026-10-22).** `sim` is
  no longer always `null`: it is a THIRD-PARTY GoPlus verdict, not a
  local simulation — `is_honeypot` present and `"0"|0` → `ok`; ANY of
  `is_honeypot`/`cannot_buy`/`cannot_sell_all` = `"1"|1` → `fail`;
  missing `is_honeypot` or a transient envelope → `null` (never an
  invented `ok`). Kill-switch `SNAPSHOT_SIM_VERDICT_ENABLED` (default
  ENABLED; explicit false-ish disables) blanks ONLY `sim`, so taxes and
  the lock survive it. The same GoPlus response now yields
  `lpLock: {lockedPercent, burnedPercent}` from `lp_holders` (fraction
  ×100, rounded 4dp, clamped 0-100; `is_locked` strict — `1|"1"` only;
  the `Null Address` counts as burned regardless; absent/empty rows or
  no parseable `percent` → `null`, and a genuine `0` never means "no
  data"). It is merged NULL-ONLY into
  `lockedLiquidityPercent`/`burnedPercent` (existing provider values are
  never overwritten; RugCheck stays Solana-only). Caveats documented:
  `lp_holders` is top-N (false negative possible, never a false
  positive) and the lock is token-level (a secondary-pool lock can badge
  the primary card). The `resolveVenue` Gecko leg, which already fetched
  the pool list, now returns
  `pairCreatedAtMs: pick.poolCreatedAtMs ?? null` instead of a hardcoded
  `null` — zero extra calls (no OHLC/Birdeye/candle) and the only path
  that fixes Gecko-only tokens whose native `priceChange24h` is non-null
  (the derivation early-returns). Fast-path cards keep skipping
  honeypot/lock and carry `pairCreatedAt: null`. No response-contract
  change: `honeypot:{buy,sell,sim}`, `lockedLiquidityPercent`,
  `burnedPercent` and `pairCreatedAt` already exist on the snapshot.

### Fixed

- **ATH seed invisible on the DB history path (case normalization):**
  `SnapshotHistoryRepository.saveSeeded` persisted `key`/`chain`/`address`
  verbatim, while the todo-68 ATH seed passes the checksummed EVM
  `inputValue`; `findFdvAth`/`findAnchorAt` build a case-SENSITIVE
  `where` from the lowercased address, so seeded rows never matched —
  the card served the live max (`751.39`), `seeded` stayed `false`, and
  the one-shot Gecko seed retried on every request. Live witness (KODA
  `0xd377…49cF`, staging 2026-10-22): seed row `2483.97` at
  `2026-10-14T00:00:00.001Z` vs served `751.39`. `save`/`saveSeeded`
  now normalize the three identity columns,
  `NormalizeSnapshotHistoryAddressCase1776000000000` repairs pre-fix
  rows, and the repository spec fakes a case-sensitive `where` (the
  in-memory ring lowercased both sides, which is why the suite missed
  it).

- **`snapshot_history.sources` type drift caught by the staging soak:**
  `CreateSnapshotHistory1772000000000` created `sources` as plain
  `text` while the entity maps `text[]`, so the driver returned array
  literals and `toHistoryRow` spread them into one entry PER CHARACTER
  — every stale replay served corrupted `sources` (fresh responses
  were unaffected; found on the first 7-day-soak run, 2026-10-20).
  `FixSnapshotHistorySourcesArray1775000000000` rewrites the column to
  `text[]` (drop legacy default → cast with a total `USING` → restore
  `'{}'::text[]`; validated by rolled-back DDL against the live
  staging rows) and `normalizeHistorySources` guards a legacy/unmigrated
  schema without re-corrupting the shape. Registered in both the app
  and the TypeORM CLI migration lists.

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

### Fixed

- **Gecko 1H row now reaches the card on the pool-fallback fetcher
  (2026-10-26, staging regression found by the soak).** The 1-hour
  harvest only wrote the four fields into `VenueMarketReading`, so it
  fired exclusively through the OHLC-derivation leg. A Gecko-only token
  whose `priceChange24h` comes from `selectPoolQuote` (the
  `geckoterminal` quote fetcher's `needsPool` / `searchPools` legs) makes
  the derivation early-return under native-wins, so the row stayed
  `null` even though the same pool response already carried
  `volume_usd.h1`, `price_change_percentage.h1` and `transactions.h1`.
  Both pool-pick literals now forward `volume1hUsd`, `priceChange1h`,
  `txns1hBuys` and `txns1hSells` from the pick they already hold — ZERO
  extra HTTP calls, identical null-only/whole-pair contract, and the
  info-complete path keeps emitting no key (single-writer pin intact).
  Specs: `provider-quote-1h.spec.ts` +2 (needsPool + searchPools legs,
  failing-first red→green); suite 161/1309 green, `tsc` clean.
