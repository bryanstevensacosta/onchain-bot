import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { ProviderRegistryService } from 'provider/application/provider-registry.service';
import { CacheService } from 'cache/application/cache.service';
import { RateLimiterPort } from 'rate-limiter/domain/rate-limiter.port';
import { resolveProviderOutboundBudget } from 'rate-limiter/domain/provider-outbound-limits';
import { AddressIdVo } from 'address/domain/address-id.vo';
import { AddressKindDetectorService } from 'address/application/address-kind-detector.service';
import {
  AddressSnapshot,
  AddressSnapshotInput,
} from '../domain/snapshot.types';
import {
  SNAPSHOT_CACHE_TTL_SECONDS,
  SNAPSHOT_QUOTE_PROVIDERS,
  SNAPSHOT_QUOTE_FIELDS,
  emptySnapshotQuote,
  resolveStaleMaxAgeMs,
  type QuoteFetcher,
  type SnapshotQuote,
} from '../domain/snapshot-quote.types';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import type { AggregationOutcome } from 'aggregators/application/snapshot-aggregator.service';
import { AggregationPolicyPort } from 'aggregators/domain/aggregation-policy.port';
import {
  DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT,
  LaunchpadDetectorService,
  resolveDetectorSlowLegTimeoutMs,
} from 'launchpad/application/launchpad-detector.service';
import type { LaunchpadInfo } from 'launchpad/domain/launchpad-info';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { BIRDEYE_SUPPORTED_CHAINS } from 'provider/infrastructure/birdeye/birdeye.service';
import {
  GECKO_NETWORK_SLUGS,
  GECKO_SUPPORTED_CHAINS,
} from 'provider/infrastructure/quote-fetchers/provider-quote.fetchers';
import { selectPoolQuote } from 'provider/infrastructure/geckoterminal';
import { toVenueOrNull, type SnapshotVenue } from '../domain/snapshot-venue';
import {
  deriveChange24hFromOhlcv,
  OHLC_CHANGE_PAST_TOLERANCE_MS,
  OHLC_CHANGE_WINDOW_MS,
  type OhlcvCandle,
} from '../domain/snapshot-ohlcv-change';
import {
  buildOhlcvSeedRows,
  deriveOutrightVsLiveChange,
  OHLC_BACKFILL_SOURCE,
  OHLC_BACKFILL_SOURCE_BIRDEYE,
  OHLC_BACKFILL_WINDOW_MS,
} from '../domain/snapshot-ohlcv-backfill';
import {
  applyComputedFdv,
  computedFdvEpsilonBound,
} from '../domain/snapshot-computed-fdv';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import {
  deriveSnapshotNullReason,
  SnapshotNullMetricsService,
} from './snapshot-null-metrics.service';
import { applyOutboundRateLimit } from 'provider/infrastructure/quote-fetchers/rate-limited-fetchers';
import { applySingleRetryFetchers } from 'provider/infrastructure/quote-fetchers/fetcher-retry';
import { DevHoldingsPort } from '../../holders/domain/holdings.port';
import { AssetResolverService } from 'asset-registry/application/asset-resolver.service';
import { CircuitBreakerService } from 'shared/infrastructure/rate-limiter/application/circuit-breaker.service';
import {
  DIRECT_FAST_PATH_DEADLINE_MS,
  DirectFastPathService,
} from './direct-fast-path.service';
import {
  selectPreferredQuote,
  TOLERANCE_DEFAULT_BPS,
} from 'provider/infrastructure/onchain/evm-tolerance';
import { DiscoveryCacheService } from './discovery-cache.service';
import { OnchainSolanaReaderService } from 'provider/infrastructure/onchain/onchain-solana.reader';
import { SingleflightService } from './singleflight.service';
import {
  QuotaGovernorService,
  quotaGovernorTierOf,
  type QuotaGovernorTier,
} from './quota-governor.service';
import {
  isStaleTrioValid,
  isTailDegraded,
} from '../domain/snapshot-ttl-policy';

/** Log helper: nullable ms renders as `n/a` (never crashes the line). */
const roundMs = (ms: number | null): string =>
  ms === null ? 'n/a' : String(Math.round(ms));

/**
 * Raw epoch ms → ISO for `AddressSnapshot.pairCreatedAt` (dexter
 * plan todo 63). Single conversion seam: the tail (`resolveVenue`,
 * hit and miss) and the fast-path handoff both carry RAW ms; this
 * helper is the only ms→ISO step. Guards: a non-number (absent on
 * legacy hand-mocks/summaries), non-finite or `<= 0` value resolves
 * `null`; an ISO-invalid magnitude (finite but outside the Date
 * range) also resolves `null` — never an `Invalid Date` throw.
 */
export function toIsoPairCreatedAt(ms: unknown): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  const at = new Date(ms);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * Snapshot-tail budgets (dexter plan todo 29 — the tail is the
 * launchpad/venue/dev extras that run AFTER the quote fan-out; the
 * 28 re-measurement attributes ~2.5-6s of cold p95 to this tail).
 */
export const SNAPSHOT_TAIL_CONCURRENCY = 3;
export const SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS = 400;
/**
 * Metadata-identity budget (dexter plan todo 39): the post-merge
 * last-resort Metaplex read runs ONLY when the merged quote names
 * nothing, so the healthy path pays zero. Own deadline, fail-open.
 */
export const METADATA_IDENTITY_BUDGET_MS = 2000;

/**
 * Detector-tail budget (dexter plan todo 35): the launchpad detector
 * is OUT of the 400ms extras budget — it rides its OWN deadline (the
 * same `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS` the detector's Pons SSR leg is
 * aborted by, default `DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT`). The
 * deadline only MATTERS when the detector runs long (slow legs after
 * fast-leg miss): a fast hit returns at its natural speed under EITHER
 * budget, so fast-path timing is unchanged. Venue/dev keep the 400ms
 * `SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS` intact.
 */
export const SNAPSHOT_TAIL_LAUNCHPAD_TIMEOUT_MS_DEFAULT =
  DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT;

/** Breaker key namespace (disjoint from the `outbound:` buckets). */
export const snapshotBreakerKey = (name: string): string =>
  `snapshot-fetcher:${name}`;

/**
 * Chunked parallel runner (todo 29: no p-limit-style helper exists in
 * this app — verified by grep, so this 10-line local IS the helper).
 * Runs at most `concurrency` tasks at once, preserves order, never
 * throws when the tasks themselves never throw (each tail task is
 * catch-all by construction).
 */
export async function runTailCapped<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  concurrency: number,
): Promise<Array<T>> {
  const results = new Array<T>(tasks.length);
  const cap = Math.max(1, Math.min(concurrency, tasks.length));
  for (let start = 0; start < tasks.length; start += cap) {
    const chunk = tasks.slice(start, start + cap);
    const settled = await Promise.allSettled(chunk.map((task) => task()));
    for (let i = 0; i < chunk.length; i += 1) {
      const outcome = settled[i];
      if (outcome.status === 'fulfilled') {
        results[start + i] = outcome.value;
      }
    }
  }
  return results;
}

const TAIL_TIMEOUT = Symbol('tail-timeout');

/**
 * Per-extra tail budget (todo 29): the extra resolves to its value or
 * to the timeout sentinel after `SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS` — the
 * card NEVER waits on an extra. The abandoned work keeps its own
 * (longer) internal timeout and is catch-all, so no unhandled
 * rejection and no lingering await: the race already observed it.
 */
function withTailBudget<T>(
  work: Promise<T>,
  ms: number = SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS,
): Promise<T | typeof TAIL_TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const guard = new Promise<typeof TAIL_TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TAIL_TIMEOUT), ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
  return Promise.race([work, guard]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}

/**
 * AddressSnapshotService (Tramo 3, P45; canonical home todo 12, P50;
 * live aggregation todo-3 gap).
 *
 * The absorbed token path: kind=token snapshots compose exactly what
 * the old token shell did (chain validation + supporting-provider
 * hints), now with a live parallel fan-out over the supporting
 * providers (first-non-null merge). Every other kind rides the same
 * shape — one snapshot per kind. Chain qualifier is mandatory: empty
 * chain throws, unknown chain 404s (never a silent null). `ready`
 * needs a single merged field; `pending` (all providers failed) names
 * every miss in `providerErrors`. Hot results are cached (30s TTL) and
 * every call persists one history row (P44). MANDATORY order
 * (todo 14, anti-ban): the cache is checked FIRST — a HIT returns
 * before any outbound budget is touched; the per-provider token
 * buckets gate fetchers ONLY on a miss. A denied bucket is an
 * explicit `providerErrors` entry, never a failed snapshot.
 */
@Injectable()
export class AddressSnapshotService {
  private readonly logger = new Logger(AddressSnapshotService.name);
  /**
   * Serve-stale bound (dexter plan todo 19b1): ready rows older than
   * this never replay. Env `SNAPSHOT_STALE_MAX_AGE_HOURS`, default
   * 24h (`SNAPSHOT_STALE_MAX_AGE_MS`). Read once at construction —
   * no per-request config lookup on the hot path.
   */
  private readonly staleMaxAgeMs: number = resolveStaleMaxAgeMs(
    process.env['SNAPSHOT_STALE_MAX_AGE_HOURS'],
  );

  /**
   * Launchpad-tail budget instance value (dexter plan todo 35 — same
   * env as the detector slow leg, single source of truth). Read once
   * at construction, like `staleMaxAgeMs` above.
   */
  private readonly launchpadTailMs: number = resolveDetectorSlowLegTimeoutMs(
    process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'],
  );

  public constructor(
    private readonly catalog: ChainCatalogPort,
    private readonly providers: ProviderRegistryService,
    private readonly kinds: AddressKindDetectorService,
    private readonly aggregator: SnapshotAggregatorService,
    private readonly history: SnapshotHistoryRepository,
    @Optional()
    @Inject(SNAPSHOT_QUOTE_PROVIDERS)
    private readonly fetchers: ReadonlyArray<QuoteFetcher> | null,
    @Optional() private readonly cache: CacheService | null,
    @Optional()
    @Inject(RateLimiterPort)
    private readonly outbound: RateLimiterPort | null = null,
    @Optional()
    @Inject(DevHoldingsPort)
    private readonly devHoldings: DevHoldingsPort | null = null,
    @Optional()
    @Inject(AggregationPolicyPort)
    private readonly policy: AggregationPolicyPort | null = null,
    @Optional()
    private readonly assets: AssetResolverService | null = null,
    @Optional()
    @Inject(LaunchpadDetectorService)
    private readonly launchpad: LaunchpadDetectorService | null = null,
    @Optional()
    @Inject(DexScreenerService)
    private readonly dexscreener: DexScreenerService | null = null,
    @Optional()
    @Inject(GeckoTerminalService)
    private readonly geckoterminal: GeckoTerminalService | null = null,
    @Optional()
    private readonly nullMetrics: SnapshotNullMetricsService | null = null,
    // Union-typed params emit `Object` metadata: `@Inject` is mandatory
    // here, otherwise Nest resolves null even when registered.
    @Optional()
    @Inject(DirectFastPathService)
    private readonly fastPath: DirectFastPathService | null = null,
    // Breaker (dexter plan todo 29, 19b3): THE one gating path. The
    // existing CircuitBreakerService (in-memory Map, constructed with
    // its defaults: 5 consecutive failures -> 30s cool-off) is wired
    // here; the registry `recordFailure` counters stay TELEMETRY-only
    // (`listStatus` for the gateway, never a gate) — one way, never
    // both. Memory store + reset-on-deploy ACCEPTED: a deploy wipes
    // the failure counts, so a flapping provider gets a clean slate
    // per deploy (documented, not hidden). Fail-open everywhere:
    // `canExecute === false` SKIPS the fetcher (explicit
    // `providerErrors` note), never throws, never blocks the card.
    @Optional()
    @Inject(CircuitBreakerService)
    private readonly breaker: CircuitBreakerService | null = null,
    // Discovery cache (dexter plan todo 30b): cache-first discovery
    // with tripwire verification. Null in hand-built specs -> direct
    // `getBestPairSummaryForChain` (byte-identical fallback).
    @Optional()
    @Inject(DiscoveryCacheService)
    private readonly discoveryCache: DiscoveryCacheService | null = null,
    // Metadata-identity reader (dexter plan todo 39): the post-merge
    // last-resort leg. Same provider the fast path uses (module
    // factory), `@Inject` mandatory on the union type. Null in
    // hand-built specs -> identity-less quotes stay as they are.
    @Optional()
    @Inject(OnchainSolanaReaderService)
    private readonly solanaReader: OnchainSolanaReaderService | null = null,
    // Singleflight (dexter plan todo 41a): N-concurrent same-key
    // snapshots collapse to ONE upstream run. Null in hand-built
    // specs -> direct call-through, byte-identical.
    @Optional()
    @Inject(SingleflightService)
    private readonly singleflight: SingleflightService | null = null,
    // Quota governor (dexter plan todo 41d): the ONE governor, read
    // BEFORE the fan-out. Null in hand-built specs -> admit all.
    @Optional()
    @Inject(QuotaGovernorService)
    private readonly governor: QuotaGovernorService | null = null,
    // Keyed token-level OHLC fallback (dexter plan todo 55): fires ONLY
    // when the Gecko pool route yields no candles (WENCAT class — no
    // indexed pools at all). Null in hand-built specs -> gecko-only,
    // byte-identical to pre-55.
    @Optional()
    @Inject(BirdeyeService)
    private readonly birdeye: BirdeyeService | null = null,
  ) {}

  /** In-flight half-open probe key (at most ONE globally — the single cheapest-fetcher probe). */
  private halfOpenProbeInFlight: string | null = null;

  private async resolveAssetId(
    chain: string,
    address: string,
    quote: { symbol: string | null; name: string | null },
  ): Promise<string | null> {
    if (this.assets === null || this.assets === undefined) {
      return null;
    }
    try {
      const found = await this.assets.resolve({ chain, contract: address });
      return found.id;
    } catch {
      try {
        const created = await this.assets.upsert({
          chain,
          contract: address,
          symbol: quote.symbol,
          name: quote.name,
        });
        return created.id;
      } catch {
        return null;
      }
    }
  }

  private async resolveLaunchpad(
    chain: string,
    address: string,
  ): Promise<LaunchpadInfo | null> {
    if (this.launchpad === null || this.launchpad === undefined) return null;
    try {
      return await this.launchpad.detectLaunchpad(chain, address);
    } catch {
      return null;
    }
  }

  /**
   * Metadata identity, LAST resort (dexter plan todo 39): when the
   * merged quote names nothing AND the fast path pinned no source,
   * read the Solana Metaplex metadata PDA once. Solana token-kind
   * ONLY (no EVM metadata leg — EVM identity-less stays as-is);
   * Token-2022 mints ride the same PDA derivation (program-agnostic
   * — only extension-embedded names without a PDA are out of scope).
   * Identity-ONLY: symbol/name fill from metadata, everything else
   * (supply/holders/price) stays aggregator-owned. Own budget
   * (`METADATA_IDENTITY_BUDGET_MS`), fail-open null; a timeout names
   * itself in `providerErrors` like the tail legs do.
   */
  private async resolveMetadataIdentity(
    chain: string,
    kind: string,
    address: string,
    quote: SnapshotQuote,
    providerErrors: Record<string, string>,
  ): Promise<{
    readonly symbol: string | null;
    readonly name: string | null;
  } | null> {
    if (chain !== 'solana' || kind !== 'token') return null;
    if (quote.symbol !== null || quote.name !== null) return null;
    if (this.solanaReader === null || this.solanaReader === undefined) {
      return null;
    }
    try {
      const raced = await withTailBudget(
        this.solanaReader.getTokenBasics(address),
        METADATA_IDENTITY_BUDGET_MS,
      );
      if (raced === TAIL_TIMEOUT) {
        providerErrors['metadata-identity'] =
          `timeout (metadata-identity budget ${METADATA_IDENTITY_BUDGET_MS}ms) — degraded to null, fail-open`;
        return null;
      }
      const meta = raced?.metadata ?? null;
      if (meta === null) return null;
      const symbol = meta.symbol !== '' ? meta.symbol : null;
      const name = meta.name !== '' ? meta.name : null;
      if (symbol === null && name === null) return null;
      return { symbol, name };
    } catch {
      return null;
    }
  }

  /**
   * Strict per-chain venue (plan todo 18): the snapshot ALWAYS
   * carries an explicit chain, so the venue resolves through the
   * chain-scoped summary — never the cross-chain best pair. Chain
   * with no pair (or no slug mapping) resolves `null`; the renderer
   * already renders that as empty.
   *
   * Gecko fallback (plan todo 26): when DexScreener has no pair for
   * the token (e.g. STAGEVEIL on robinhood), the GeckoTerminal pool
   * carries the venue in `relationships.dex.data.id` (live:
   * `pons-v2-dex`). The dex id passes through verbatim with empty
   * labels — dexter's display table capitalizes unknown ids, so the
   * card stays non-empty without a new table on either side.
   *
   * Pair creation (dexter plan todo 63): the SAME `best` summary that
   * names the venue (hit AND miss — the object is in hand on both)
   * carries the best-pair `pairCreatedAt` raw ms; it rides out beside
   * the venue and `buildSnapshot` converts it once to ISO. The Gecko
   * leg carries NO creation time (`pairCreatedAtMs: null` — its
   * `pool_created_at` would be an extra fetch on a path that only
   * fires when DexScreener has no pair; documented caveat, dexter
   * `{{age}}` renders `""` there).
   */
  private async resolveVenue(
    chain: string,
    address: string,
  ): Promise<{
    readonly venue: SnapshotVenue | null;
    readonly pairCreatedAtMs: number | null;
  }> {
    if (this.dexscreener !== null && this.dexscreener !== undefined) {
      try {
        // Discovery cache first (dexter plan todo 30b): tripwire-
        // verified cached discovery, zero `token-pairs` calls on hit;
        // direct strict discovery when the cache service is absent.
        const best =
          this.discoveryCache !== null && this.discoveryCache !== undefined
            ? await this.discoveryCache.resolveDiscovery(chain, address)
            : await this.dexscreener.getBestPairSummaryForChain(chain, address);
        if (best !== null) {
          return {
            venue: toVenueOrNull({ dexId: best.dexId, labels: best.labels }),
            pairCreatedAtMs: best.pairCreatedAt ?? null,
          };
        }
      } catch {
        // Fall through to the Gecko leg below (fail-open, never throws).
      }
    }
    if (
      this.geckoterminal === null ||
      this.geckoterminal === undefined ||
      !GECKO_SUPPORTED_CHAINS.includes(chain)
    ) {
      return { venue: null, pairCreatedAtMs: null };
    }
    try {
      const slug = GECKO_NETWORK_SLUGS[chain] ?? chain;
      const pools = await this.geckoterminal.getTokenPools(slug, address);
      const pick = selectPoolQuote(pools, address);
      if (pick === null || pick.dexId === null) {
        return { venue: null, pairCreatedAtMs: null };
      }
      // Gecko carries no pair-creation read here (todo 63 caveat:
      // extra fetch avoided on the no-DSC-pair path) → ms stays null.
      return {
        venue: toVenueOrNull({ dexId: pick.dexId, labels: [] }),
        pairCreatedAtMs: null,
      };
    } catch {
      return { venue: null, pairCreatedAtMs: null };
    }
  }

  /**
   * OHLC-derived 24h change (dexter plan todos 33 + 46 + 55, fallback leg).
   *
   * PRECEDENCE (structural, not advisory): a non-null `nativeChange`
   * — i.e. ANY native field surviving the fan-out merge (DexScreener,
   * Birdeye, CoinGecko, Moralis, Gecko `/info` itself) — returns null
   * here with ZERO extra calls, so natives always win. The leg fires
   * only when every native is null. Source ladder (todo 55):
   *
   * 1. Gecko pool route (keyless, preferred, unchanged): pool discovery
   *    (same two-step as the gecko fetcher: `getTokenPools`, then
   *    `searchPools` on miss) plus ONE `hour/aggregate=1` OHLC call.
   * 2. When that yields NO candles (no pool row at all — the WENCAT
   *    class — or an empty fetch), the keyed Birdeye token-level route
   *    (`/defi/v3/ohlcv`, `type=1H` over the seed window) backs the leg
   *    instead, tagged `birdeye-ohlcv` end-to-end so seeds/provenance
   *    never claim Gecko for data Gecko did not index.
   *
   * The exact-24h-window math and the backfill below are IDENTICAL for
   * both sources. Anything missing or out-of-window resolves null
   * (fail-open, never throws — same contract as `resolveVenue` above).
   *
   * TODO 46 (backfill, camino al 0% honesto): the acquired candles
   * ALSO seed history once per pool (`seedOhlcvBackfill` — candle-time
   * `createdAt`, idempotent via `unique(key, createdAt)`), and the
   * derivation prefers outright-24h-vs-now-live (history anchor vs
   * the current merged price, strictly fresher than any candle)
   * over the candle-pure math (kept as fallback for the
   * no-live-price/pending shape). Seeding piggybacks THIS fetch —
   * no dedicated backfill fetch ever exists.
   */
  private async resolveDerivedChange24h(
    chain: string,
    address: string,
    nativeChange: number | null,
    live: {
      readonly priceUsd: number | null;
      readonly totalSupply: number | null;
      readonly maxSupply: number | null;
    },
    identity: { readonly key: string; readonly kind: string },
  ): Promise<{
    readonly change: number | null;
    readonly seeded: number;
    readonly source: string | null;
  }> {
    if (nativeChange !== null && nativeChange !== undefined) {
      return { change: null, seeded: 0, source: null };
    }
    const nowMs = Date.now();
    const acquired = await this.acquireDerivationCandles(chain, address, nowMs);
    if (acquired === null) {
      return { change: null, seeded: 0, source: null };
    }
    try {
      const seeded = await this.seedOhlcvBackfill(
        identity.key,
        identity.kind,
        chain,
        address,
        acquired.candles,
        live,
        nowMs,
        acquired.source,
      );
      const outright = await this.resolveOutrightVsLiveChange(
        chain,
        address,
        live.priceUsd,
        nowMs,
      );
      if (outright !== null) {
        return { change: outright, seeded, source: acquired.source };
      }
      return {
        change: deriveChange24hFromOhlcv(acquired.candles, nowMs),
        seeded,
        source: acquired.source,
      };
    } catch {
      return { change: null, seeded: 0, source: null };
    }
  }

  /**
   * Candle acquisition ladder (todo 55): Gecko pool route first — once
   * it has PICKED a pool its answer is final-shape (possibly empty,
   * which pre-55 used to proceed to the history-anchor attempt with
   * zero seeds; that fidelity is preserved below). Only a candle-less
   * Gecko answer escalates to the keyed Birdeye token-level route
   * (WENCAT class). `null` = no source served candles → the caller
   * answers the pre-55 dead-end shape (`{change: null, seeded: 0}`)
   * WITHOUT a history-anchor attempt, exactly like the old no-pick /
   * gecko-threw branches.
   */
  private async acquireDerivationCandles(
    chain: string,
    address: string,
    nowMs: number,
  ): Promise<{
    readonly candles: ReadonlyArray<OhlcvCandle> | null;
    readonly source: string;
  } | null> {
    let geckoPicked = false;
    let geckoAnswered = false;
    let candles: ReadonlyArray<OhlcvCandle> | null = null;
    if (
      this.geckoterminal !== null &&
      this.geckoterminal !== undefined &&
      GECKO_SUPPORTED_CHAINS.includes(chain)
    ) {
      try {
        const slug = GECKO_NETWORK_SLUGS[chain] ?? chain;
        const pools = await this.geckoterminal.getTokenPools(slug, address);
        let pick = selectPoolQuote(pools, address);
        if (pick === null) {
          const searchPools = this.geckoterminal.searchPools?.bind(
            this.geckoterminal,
          );
          if (typeof searchPools === 'function') {
            pick = selectPoolQuote(await searchPools(address), address);
          }
        }
        if (pick !== null && pick.poolAddress !== null) {
          geckoPicked = true;
          candles = await this.geckoterminal.getPoolOhlcv(
            slug,
            pick.poolAddress,
            pick.side ?? 'base',
          );
          geckoAnswered = true;
        } else {
          // Definitive no-pool answer (pre-55 early return).
          geckoAnswered = true;
        }
      } catch {
        // Gecko leg dead — the keyed fallback below may still serve.
      }
    }
    let source: string | null =
      candles !== null && candles.length > 0 ? OHLC_BACKFILL_SOURCE : null;
    if (
      source === null &&
      this.birdeye !== null &&
      this.birdeye !== undefined &&
      BIRDEYE_SUPPORTED_CHAINS.includes(chain)
    ) {
      try {
        const tokenCandles = await this.birdeye.getTokenOhlcv(
          address,
          chain,
          '1H',
          Math.floor((nowMs - OHLC_BACKFILL_WINDOW_MS) / 1000),
          Math.floor(nowMs / 1000),
        );
        if (tokenCandles !== null && tokenCandles.length > 0) {
          candles = tokenCandles;
          source = OHLC_BACKFILL_SOURCE_BIRDEYE;
        }
      } catch {
        // Fallback dead — keep whatever the Gecko leg produced.
      }
    }
    if (source === null) {
      // No candles from either source. Pre-55 fidelity: a picked Gecko
      // answer that came back empty still proceeds (zero seeds; the
      // history-anchor attempt stands); every other dead end skips.
      if (geckoPicked && geckoAnswered) {
        return { candles, source: OHLC_BACKFILL_SOURCE };
      }
      return null;
    }
    return { candles, source };
  }

  /**
   * One-time per-pool OHLC seed (dexter plan todo 46; source-aware
   * todo 55). Builds rows from the derivation fetch's candles (same
   * merged supply the FDV seam seals this encounter with) and persists
   * them with candle-time `createdAt`, tagged with the ACTUAL source
   * that produced them (`geckoterminal-ohlcv` | `birdeye-ohlcv`).
   * Fail-open: any store error degrades to zero seeded (the change leg
   * below still runs on the candles). Returns the count of newly
   * inserted rows (collisions report 0).
   */
  private async seedOhlcvBackfill(
    key: string,
    kind: string,
    chain: string,
    address: string,
    candles: ReadonlyArray<OhlcvCandle> | null,
    live: {
      readonly totalSupply: number | null;
      readonly maxSupply: number | null;
    },
    nowMs: number,
    source: string,
  ): Promise<number> {
    try {
      const rows = buildOhlcvSeedRows(
        candles,
        {
          key,
          chain,
          address,
          kind,
          totalSupply: live.totalSupply,
          maxSupply: live.maxSupply,
          source,
        },
        nowMs,
      );
      let seeded = 0;
      for (const row of rows) {
        const saved = await this.history.saveSeeded(row);
        if (saved !== null) seeded += 1;
      }
      if (seeded > 0) {
        this.logger.debug(
          `ohlcv-backfill seeded chain=${chain} address=${address} rows=${seeded}`,
        );
      }
      return seeded;
    } catch {
      return 0;
    }
  }

  /**
   * Outright-24h vs now-live (dexter plan todo 46): the past anchor
   * is the history row (backfill + live — the seed above runs BEFORE
   * this read, so the first encounter already anchors on its own
   * candles) nearest to exactly-24h-ago within ±2h; the now-leg is
   * the current merged price. Gaps (no anchor, no live price) → null.
   * Fail-open: any history error answers null (the candle-pure
   * fallback still runs at the call above).
   */
  private async resolveOutrightVsLiveChange(
    chain: string,
    address: string,
    livePriceUsd: number | null,
    nowMs: number,
  ): Promise<number | null> {
    try {
      const anchor = await this.history.findAnchorAt(
        chain,
        address,
        nowMs - OHLC_CHANGE_WINDOW_MS,
        OHLC_CHANGE_PAST_TOLERANCE_MS,
      );
      return deriveOutrightVsLiveChange(anchor?.quote?.priceUsd, livePriceUsd);
    } catch {
      return null;
    }
  }

  /**
   * Breaker gate (todo 29, fail-open skip-not-throw). Fetchers whose
   * breaker is open are REMOVED from this snapshot's fan-out (the skip
   * is named in `providerErrors` downstream — never silent, never a
   * throw). Half-open admits a SINGLE probe: the first half-open
   * fetcher in policy (cheapest-first) order goes through while a
   * probe is in flight; the rest skip until it settles. Without an
   * injected breaker this is the identity (zero behavior change, so
   * all pre-breaker specs stay green untouched).
   */
  private applyBreakerGate(fetchers: ReadonlyArray<QuoteFetcher>): {
    readonly admitted: ReadonlyArray<QuoteFetcher>;
    readonly skipped: ReadonlyArray<string>;
    readonly halfOpenKey: string | null;
  } {
    if (this.breaker === null || this.breaker === undefined) {
      return { admitted: fetchers, skipped: [], halfOpenKey: null };
    }
    const admitted: Array<QuoteFetcher> = [];
    const skipped: Array<string> = [];
    let halfOpenKey: string | null = null;
    const probeBusy = this.halfOpenProbeInFlight !== null;
    for (const fetcher of fetchers) {
      const key = snapshotBreakerKey(fetcher.name);
      if (!this.breaker.canExecute(key)) {
        skipped.push(fetcher.name);
        continue;
      }
      if (this.breaker.getState(key) === 'half-open') {
        if (probeBusy || halfOpenKey !== null) {
          skipped.push(fetcher.name);
          continue;
        }
        halfOpenKey = key;
        this.halfOpenProbeInFlight = key;
        this.logger.log(
          `breaker half-open probe admitted (single cheapest): ${fetcher.name}`,
        );
      }
      admitted.push(fetcher);
    }
    return { admitted, skipped, halfOpenKey };
  }

  /**
   * Breaker state metric (todo 29): per-fetcher circuit state for the
   * future `/metrics` exporter (mirrors `SnapshotNullMetricsService`
   * — counts there, states here). Unknown fetchers read `closed`.
   */
  public breakerStates(): Record<string, string> {
    const states: Record<string, string> = {};
    for (const provider of this.providers.listProviders()) {
      states[provider.name] =
        this.breaker?.getState(snapshotBreakerKey(provider.name)) ?? 'closed';
    }
    return states;
  }

  public async getSnapshot(
    input: AddressSnapshotInput,
  ): Promise<AddressSnapshot> {
    const entryStartedAt = performance.now();
    const chain = (input.chain ?? '').trim();
    if (chain === '') {
      throw new NotFoundException('Chain qualifier is required');
    }
    const known = await this.catalog.findById(chain);
    if (known === null) {
      throw new NotFoundException(`Unknown chain: ${chain}`);
    }
    const kind = await this.kinds.detect({
      chain: known.id,
      value: input.value,
      kindHint: input.kindHint,
      probe: input.probe ?? null,
    });
    const kindMs = Math.round(performance.now() - entryStartedAt);
    const id = AddressIdVo.from(known.id, input.value, kind);
    const supporting = this.providers
      .listProviders()
      .filter((provider) => provider.supportsChains.includes(known.id))
      .map((provider) => provider.name);
    // Normalization IS `AddressIdVo` (no new function by design):
    // the singleflight key is the same normalized cache key below.
    const cacheKey = `snapshot:${id.chain}:${id.address}:${id.kind}`;
    const run = (): Promise<AddressSnapshot> =>
      this.getSnapshotInner({
        knownId: known.id,
        inputValue: input.value,
        cacheKey,
        kind,
        id,
        supporting,
        kindMs,
      });
    // Singleflight at the `getSnapshot` entry (the single choke point
    // every edge/batch caller funnels through): N concurrent same-key
    // calls collapse to ONE upstream run.
    if (this.singleflight !== null && this.singleflight !== undefined) {
      return this.singleflight.run(cacheKey, run);
    }
    return run();
  }

  private async getSnapshotInner(args: {
    readonly knownId: string;
    readonly inputValue: string;
    readonly cacheKey: string;
    readonly kind: string;
    readonly id: AddressIdVo;
    readonly supporting: ReadonlyArray<string>;
    readonly kindMs: number;
  }): Promise<AddressSnapshot> {
    const startedAt = performance.now();
    const { knownId, inputValue, cacheKey, kind, id, supporting, kindMs } =
      args;
    if (this.cache) {
      const cached = await this.cache.get<AddressSnapshot>(cacheKey);
      if (cached !== null) {
        // Metric only: a pre-deploy pending row served from cache.
        // Post-deploy this must decay to 0 (nothing writes pending
        // anymore) — a nonzero `cached` past deploy+60s is the alarm.
        if (cached.status === 'pending') {
          this.nullMetrics?.record('cached');
        }
        return cached;
      }
    }
    const active = (this.fetchers ?? []).filter((fetcher) =>
      fetcher.supportsChains.includes(knownId),
    );
    // Aggregators policy order (market-data restructure): ordered
    // provider list from context (kind, chain, fields, quota state,
    // account credits). Empty quota/credits is the identity — the
    // cascade order is byte-identical to the pre-policy pipeline.
    const ordered =
      this.policy === null
        ? active
        : this.policy.orderFetchers(active, {
            kind,
            chain: knownId,
            address: inputValue,
            fields: [...SNAPSHOT_QUOTE_FIELDS],
            quota: {},
            credits: {},
          });
    // Quota governor (dexter plan todo 41d): read BEFORE the fan-out,
    // AFTER the cache check above (HITs cost zero quota and never
    // consult it). Every other call-site funnels through this method
    // and checks NOTHING itself.
    const governed = this.applyGovernorTierSkip(ordered);
    const gated = applyOutboundRateLimit(
      governed.admitted,
      this.outbound,
      (name: string) =>
        resolveProviderOutboundBudget(this.providers.listProviders(), name),
    );
    // Single retry OUTSIDE the gate (dexter plan todo 19b2): each attempt
    // runs the GATED fetch, so the retry burns from the SAME
    // `outbound:<name>` bucket — worst case 2 x cost per miss per
    // fetcher, never a phantom budget. Sibling 19b1 (stale floor
    // below) untouched: stale serves only when the fanned-out result
    // below is pending, retry or not.
    // Breaker sits between the outbound wrap and the retry (todo 29:
    // policy -> outbound-gate -> breaker-skip -> retry -> aggregate):
    // a skipped fetcher never runs, so it burns neither retry delay
    // nor outbound budget.
    const breakerGate = this.applyBreakerGate(gated);
    const retried = applySingleRetryFetchers(breakerGate.admitted);
    // Direct fast-path FIRST (todo 22 wire-up): the fan-out starts
    // IMMEDIATELY and the on-chain readers race a HARD deadline
    // against it. Sane direct values serve at direct speed while the
    // in-flight fan-out completes in background for the log-only
    // tolerance check (no second run). ANY direct miss (no coverage,
    // timeout, insane values) awaits the already-running fan-out —
    // the fallback path below is byte-identical and pays ~zero
    // direct penalty when the miss is fast (instant-null coverage).
    const fanoutP = this.aggregator
      .aggregate(knownId, inputValue, retried)
      .finally(() => {
        // Half-open probe release: the probe is the FETCHER call, which
        // is done when the aggregate settles (the aggregate itself never
        // rejects — allSettled inside). Release exactly our own key so a
        // concurrent snapshot's probe is never stolen.
        if (
          breakerGate.halfOpenKey !== null &&
          this.halfOpenProbeInFlight === breakerGate.halfOpenKey
        ) {
          this.halfOpenProbeInFlight = null;
        }
      });
    const fastStartedAt = performance.now();
    const fast =
      this.fastPath === null
        ? null
        : await this.fastPath.tryResolve(
            { chain: knownId, address: inputValue, kind },
            DIRECT_FAST_PATH_DEADLINE_MS,
          );
    const directMs = Math.round(performance.now() - fastStartedAt);
    if (fast !== null) {
      const built = await this.buildSnapshot({
        knownId,
        inputValue,
        cacheKey,
        kind,
        id,
        supporting,
        outcome: fast.outcome,
        launchpad: { resolved: true, value: fast.launchpad },
        venue: {
          resolved: true,
          value: fast.venue,
          pairCreatedAt: fast.pairCreatedAt,
        },
        skipDevHoldings: true,
        breakerSkipped: breakerGate.skipped,
        breakerAdmitted: [],
        governor: governed.note,
        outcomeIsAggregate: false,
      });
      this.observeGovernor(built.snapshot.providerErrors);
      this.logger.log(
        `direct-fast-path chain=${knownId} served=fast directMs=${directMs} ` +
          `discoveryMs=${roundMs(fast.timings.discoveryMs)} ` +
          `kindMs=${kindMs} tailMs=${built.tailMs} ` +
          `breakerSkipped=${breakerGate.skipped.length} ` +
          `governorShed=${governed.skipped.length} ` +
          `totalMs=${Math.round(performance.now() - startedAt)}`,
      );
      this.compareToleranceInBackground(
        fanoutP,
        knownId,
        inputValue,
        fast.outcome.quote,
      );
      return built.snapshot;
    }
    const fanoutStartedAt = performance.now();
    const outcome = await fanoutP;
    const fanoutMs = Math.round(performance.now() - fanoutStartedAt);
    const built = await this.buildSnapshot({
      knownId,
      inputValue,
      cacheKey,
      kind,
      id,
      supporting,
      outcome,
      launchpad: { resolved: false, value: null },
      venue: { resolved: false, value: null, pairCreatedAt: null },
      skipDevHoldings: false,
      breakerSkipped: breakerGate.skipped,
      breakerAdmitted: breakerGate.admitted.map((fetcher) => fetcher.name),
      governor: governed.note,
      outcomeIsAggregate: true,
    });
    this.observeGovernor(built.snapshot.providerErrors);
    this.logger.log(
      `direct-fast-path chain=${knownId} served=fanout directMs=${directMs} ` +
        `fanoutMs=${fanoutMs} kindMs=${kindMs} tailMs=${built.tailMs} ` +
        `breakerSkipped=${breakerGate.skipped.length} ` +
        `governorShed=${governed.skipped.length} ` +
        `totalMs=${Math.round(performance.now() - startedAt)}`,
    );
    return built.snapshot;
  }

  /**
   * Governor read (todo 41d): pressure evaluate + tier-skip at the
   * single pre-fan-out point. Absent governor admits all (identity).
   */
  private applyGovernorTierSkip(ordered: ReadonlyArray<QuoteFetcher>): {
    readonly admitted: ReadonlyArray<QuoteFetcher>;
    readonly skipped: ReadonlyArray<string>;
    readonly note: {
      readonly key: string;
      readonly value: string;
    } | null;
  } {
    if (this.governor === null || this.governor === undefined) {
      return { admitted: ordered, skipped: [], note: null };
    }
    const openBreakers = Object.values(this.breakerStates()).filter(
      (state) => state !== 'closed',
    ).length;
    const { level, skipTiers } = this.governor.evaluate(openBreakers);
    if (level === 0 || skipTiers.length === 0) {
      return { admitted: ordered, skipped: [], note: null };
    }
    const shed = new Set<QuotaGovernorTier>(skipTiers);
    const admitted = ordered.filter(
      (fetcher) => !shed.has(quotaGovernorTierOf(fetcher.name)),
    );
    const skipped = ordered
      .filter((fetcher) => shed.has(quotaGovernorTierOf(fetcher.name)))
      .map((fetcher) => fetcher.name);
    const tierNames = [...shed].sort().join('+');
    this.logger.warn(
      `governor shed Tier-${tierNames} (${skipped.join(',') || 'none'}) at pressure L${level} — fail-open (Tier-0 live)`,
    );
    return {
      admitted,
      skipped,
      note: {
        key: `governor:shed-tier-${tierNames}`,
        value:
          `skipped ${skipped.join(',') || 'none'} at pressure L${level} ` +
          `(${openBreakers} breakers open) — Tier-0 live, fail-open`,
      },
    };
  }

  /** Governor observe (todo 41d): feed this snapshot's errors to the NEXT evaluations. */
  private observeGovernor(
    providerErrors: Readonly<Record<string, string>>,
  ): void {
    try {
      this.governor?.observe(providerErrors);
    } catch {
      // Metric-only — never throws into the serve path.
    }
  }

  /**
   * Tolerance comparator, strictly log-only (todo 22 §4): awaits the
   * already in-flight fan-out AFTER a fast serve and warns on
   * direct-vs-aggregator divergence. Never writes history/cache/
   * registry, never throws (floating promise with a catch — the
   * render already returned).
   */
  private compareToleranceInBackground(
    fanoutP: Promise<AggregationOutcome>,
    chain: string,
    address: string,
    directQuote: Partial<SnapshotQuote>,
  ): void {
    void (async () => {
      try {
        const started = performance.now();
        const outcome = await fanoutP;
        const elapsedMs = Math.round(performance.now() - started);
        const check = selectPreferredQuote(directQuote, outcome.quote);
        if (check.diverged) {
          this.logger.warn(
            `direct-fast-path tolerance diverged ` +
              `${check.divergeBps?.toFixed(1)}bps beyond ${TOLERANCE_DEFAULT_BPS}bps ` +
              `(chain=${chain} address=${address} direct=${directQuote.priceUsd} ` +
              `aggregator=${outcome.quote.priceUsd} bgFanoutMs=${elapsedMs})`,
          );
        } else {
          // Info-level (not debug): this line IS the parity metric for
          // the wire-up — exact direct-vs-aggregator pair per fast serve.
          this.logger.log(
            `direct-fast-path tolerance ok (chain=${chain} direct=${directQuote.priceUsd} ` +
              `aggregator=${outcome.quote.priceUsd} bgFanoutMs=${elapsedMs})`,
          );
        }
      } catch (err) {
        this.logger.debug(
          `direct-fast-path background fan-out failed: ${(err as Error).message}`,
        );
      }
    })();
  }

  /**
   * Snapshot tail: launchpad/venue/fdvAth/asset/dev/merge/persist/
   * cache (moved verbatim from `getSnapshot` for the fast-path seam;
   * the fallback call below passes `resolved: false` + `skipDevHoldings:
   * false`, which reproduces the old inline behavior exactly).
   */
  private async buildSnapshot(args: {
    readonly knownId: string;
    readonly inputValue: string;
    readonly cacheKey: string;
    readonly kind: string;
    readonly id: AddressIdVo;
    readonly supporting: ReadonlyArray<string>;
    readonly outcome: AggregationOutcome;
    readonly launchpad: {
      readonly resolved: boolean;
      readonly value: LaunchpadInfo | null;
    };
    readonly venue: {
      readonly resolved: boolean;
      readonly value: SnapshotVenue | null;
      /**
       * Raw best-pair creation ms handoff (dexter plan todo 63): the
       * fast path threads `fast.pairCreatedAt` (already fetched with
       * the discovery summary — zero extra calls); the fanout path
       * passes `null` and the venue tail resolves its own. Converted
       * ONCE below via `toIsoPairCreatedAt`.
       */
      readonly pairCreatedAt: number | null;
    };
    readonly skipDevHoldings: boolean;
    readonly breakerSkipped: ReadonlyArray<string>;
    /**
     * Names admitted through the breaker gate for THIS snapshot's
     * aggregate. The fast path passes [] (its aggregate is still in
     * flight in background — nobody observes it, same as the registry
     * today).
     */
    readonly breakerAdmitted: ReadonlyArray<string>;
    /** Governor shed note (todo 41d): merged into `providerErrors` as ONE auditable key, or null. */
    readonly governor: {
      readonly key: string;
      readonly value: string;
    } | null;
    /**
     * True only when `outcome` is the settled aggregate (fanout path).
     * Gates the idle-success rule below: on the fast path the admitted
     * fetchers may still be in flight, so a success there would be
     * premature (it could close an open breaker with no real probe).
     */
    readonly outcomeIsAggregate: boolean;
  }): Promise<{ readonly snapshot: AddressSnapshot; readonly tailMs: number }> {
    const { knownId, inputValue, cacheKey, kind, id, supporting, outcome } =
      args;
    const tailStartedAt = performance.now();
    // Parallel tail (todo 29, deadline split todo 35): venue/dev race
    // under the shared 400ms budget, degrade-to-null — while launchpad
    // (the detector) rides its OWN `launchpadTailMs` deadline above.
    // Max SNAPSHOT_TAIL_CONCURRENCY in flight. Pre-resolved legs
    // (fast-path serve) cost zero tasks. fdvAth stays SEQUENTIAL
    // below: it is an indexed history read (no outbound, microseconds), and the read-before-save order
    // is the cold-start correctness rule (todo 16) — parallelizing it
    // would buy nothing and risk the ordering.
    const tailNotes: Record<string, string> = {};
    const runExtra = async <T>(
      name: 'launchpad' | 'venue' | 'dev',
      work: Promise<T | null>,
      budgetMs: number = SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS,
    ): Promise<T | null> => {
      try {
        const raced = await withTailBudget(work, budgetMs);
        if (raced === TAIL_TIMEOUT) {
          // Launchpad names its OWN budget (todo 35 — out of the
          // 400ms extras budget); venue/dev keep the shared note.
          tailNotes[`tail:${name}`] =
            name === 'launchpad'
              ? `timeout (detector budget ${budgetMs}ms) — degraded to null, fail-open`
              : `timeout (tail budget ${SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS}ms) — degraded to null, fail-open`;
          return null;
        }
        return raced;
      } catch {
        return null;
      }
    };
    const tailTasks: Array<() => Promise<unknown>> = [];
    const tailSlots: Array<'launchpad' | 'venue' | 'dev'> = [];
    if (!args.launchpad.resolved) {
      tailSlots.push('launchpad');
      tailTasks.push(() =>
        runExtra(
          'launchpad',
          this.resolveLaunchpad(knownId, inputValue),
          this.launchpadTailMs,
        ),
      );
    }
    if (!args.venue.resolved) {
      tailSlots.push('venue');
      tailTasks.push(() =>
        runExtra('venue', this.resolveVenue(knownId, inputValue)),
      );
    }
    const wantDev =
      kind === 'token' &&
      this.devHoldings !== null &&
      this.devHoldings !== undefined &&
      !args.skipDevHoldings;
    if (wantDev) {
      tailSlots.push('dev');
      tailTasks.push(async () => {
        try {
          return await runExtra(
            'dev',
            this.devHoldings?.resolve(knownId, inputValue) ??
              Promise.resolve(null),
          );
        } catch {
          return null;
        }
      });
    }
    const tailValues = await runTailCapped(
      tailTasks,
      SNAPSHOT_TAIL_CONCURRENCY,
    );
    let launchpad = args.launchpad.resolved ? args.launchpad.value : null;
    let venue = args.venue.resolved ? args.venue.value : null;
    // Pair-creation ms (todo 63): fast-path handoff first; the venue
    // tail below overwrites it on the fanout path (resolved:false).
    let pairCreatedAtMs: number | null = args.venue.pairCreatedAt;
    let devWallets: AddressSnapshot['devWallets'] = null;
    let devPctSupply: number | null = null;
    const devErrors: Record<string, string> = {};
    for (let i = 0; i < tailSlots.length; i += 1) {
      const slot = tailSlots[i];
      const value = tailValues[i];
      if (slot === 'launchpad') {
        launchpad = (value as LaunchpadInfo | null) ?? null;
      } else if (slot === 'venue') {
        const resolved = value as {
          readonly venue: SnapshotVenue | null;
          readonly pairCreatedAtMs: number | null;
        } | null;
        venue = resolved?.venue ?? null;
        pairCreatedAtMs = resolved?.pairCreatedAtMs ?? null;
      } else if (value !== null && value !== undefined) {
        const dev = value as {
          readonly devWallets?: AddressSnapshot['devWallets'];
          readonly devPctSupply?: number | null;
          readonly providerErrors?: Record<string, string>;
        };
        devWallets = dev.devWallets ?? null;
        devPctSupply = dev.devPctSupply ?? null;
        for (const [k, v] of Object.entries(dev.providerErrors ?? {})) {
          devErrors[`dev:${k}`] = v;
        }
      }
    }
    const tailMs = Math.round(performance.now() - tailStartedAt);
    // Best-pair creation → ISO (todo 63): the ONLY ms→ISO step, right
    // after the tail settled (fast-path handoff or tail-resolved ms).
    const pairCreatedAt = toIsoPairCreatedAt(pairCreatedAtMs);
    // OHLC-derived change (dexter plan todo 33): runs AFTER the tail,
    // outside the 400ms tail budget (pool discovery + one OHLC call
    // need seconds on throttled tiers — capping it would degrade the
    // leg to near-always-null). Fires only when the merged quote has
    // no native change, so healthy snapshots pay zero extra calls;
    // gap-path snapshots (already slow/pending-bound) absorb the leg.
    const derivedResolution = await this.resolveDerivedChange24h(
      knownId,
      inputValue,
      outcome.quote.priceChange24h,
      {
        priceUsd: outcome.quote.priceUsd,
        totalSupply: outcome.quote.totalSupply,
        maxSupply: outcome.quote.maxSupply,
      },
      { key: id.key, kind },
    );
    const derivedChange24h = derivedResolution.change;
    const quote: SnapshotQuote = (() => {
      const merged: SnapshotQuote =
        derivedChange24h === null
          ? outcome.quote
          : { ...outcome.quote, priceChange24h: derivedChange24h };
      // Single-seam computed FDV (dexter plan todo 38; null-only
      // DexScreener fallback todo 61): provider-reported `fdvUsd` NEVER
      // survives as a computed value — `fdv = price×(total ?? max)`
      // with the `marketCapOf`/`isSanePrice` guard vocabulary, else
      // null; `circulating` never feeds FDV (MC input only). NULL-ONLY
      // fallback: when (and only when) the computed product is null,
      // the seam serves the dedicated `dexscreenerFdvUsd` leg field
      // (written by the dexscreener fetcher alone — the generic merged
      // `fdvUsd` is never a fallback source, Gecko lesson), tagged
      // `fdvProvenance: 'dexscreener'`; a healthy computed value wins
      // ALWAYS (WENCAT/INCOME byte-identical; the Solana fast path
      // carries no DSC payload → unchanged). MC is recomputed as
      // `price×circ` when `circ` is present (no MC>FDV cards); when
      // `circ` is absent the merged MC is kept (mint supply ~=
      // circulating for most SPL mints, so MC≈FDV for fixed supply —
      // same pattern as `marketCapOf` in direct-fast-path.service.ts).
      const sealed = applyComputedFdv(merged);
      if (
        sealed.reportedFdvUsd !== null &&
        (sealed.fdvUsd === null ||
          Math.abs(sealed.reportedFdvUsd - sealed.fdvUsd) >
            computedFdvEpsilonBound(sealed.fdvUsd ?? sealed.reportedFdvUsd))
      ) {
        this.logger.debug(
          `computed-fdv discarded provider-reported fdv ` +
            `chain=${knownId} address=${inputValue} ` +
            `reported=${sealed.reportedFdvUsd} served=${sealed.fdvUsd} ` +
            `provenance=${sealed.fdvProvenance}`,
        );
      }
      if (
        sealed.marketCapRecomputed &&
        sealed.reportedMarketCapUsd !== null &&
        sealed.reportedMarketCapUsd !== sealed.marketCapUsd
      ) {
        this.logger.debug(
          `computed-fdv recohered marketCap ` +
            `chain=${knownId} address=${inputValue} ` +
            `reported=${sealed.reportedMarketCapUsd} computed=${sealed.marketCapUsd}`,
        );
      }
      return {
        ...merged,
        fdvUsd: sealed.fdvUsd,
        marketCapUsd: sealed.marketCapUsd,
        fdvProvenance: sealed.fdvProvenance,
      };
    })();
    const derivedSource = derivedResolution.source;
    const sources =
      derivedChange24h === null || derivedSource === null
        ? outcome.sources
        : [...outcome.sources, derivedSource];
    // A derived change rescues an otherwise field-less aggregate: the
    // snapshot carries one honest live field, so stale replay and the
    // pending status both stand down for it.
    const quoteFailed = outcome.allFailed && derivedChange24h === null;
    // FDV ATH is strictly historical: read BEFORE the current row is
    // persisted, so cold-start (no history) resolves null and the
    // in-flight FDV is never substituted as ATH (spec-pinned).
    const fdvAth = await this.history.findFdvAth(knownId, inputValue);
    const knownFetcherNames = new Set(
      this.providers.listProviders().map((provider) => provider.name),
    );
    for (const source of outcome.sources) {
      this.providers.recordSuccess(source, 0);
      // Breaker observes TRANSPORT failures only (todo 29): a source
      // that contributed is a success by definition. Unknown names
      // (e.g. `onchain-direct` on the fast path) are not fetchers and
      // never touch the breaker — same guard the registry applies via
      // its descriptor map.
      if (knownFetcherNames.has(source)) {
        const key = snapshotBreakerKey(source);
        const before = this.breaker?.getState(key);
        this.breaker?.recordSuccess(key);
        if (before !== undefined && before !== null && before !== 'closed') {
          this.logger.log(`breaker closed: ${source}`);
        }
      }
    }
    for (const name of Object.keys(outcome.errors)) {
      if (!outcome.sources.includes(name)) {
        this.providers.recordFailure(name);
        // KNOWN BLIND SPOT (documented, not hidden): an exhausted 19b2
        // retry collapses to fulfilled-null, so the aggregator records
        // the SAME `'no data'` as an honest empty — the breaker cannot
        // tell a 429-storm from no-market without a new taxonomy, and
        // inventing one here would churn the merge contract. The
        // breaker therefore counts only THROWS (timeout / outbound-deny
        // / adapter errors) and stays conservative on `'no data'`.
        if (knownFetcherNames.has(name) && outcome.errors[name] !== 'no data') {
          const key = snapshotBreakerKey(name);
          this.breaker?.recordFailure(key);
          if (
            this.breaker?.getState(key) === 'open' &&
            this.breaker !== null &&
            this.breaker !== undefined
          ) {
            this.logger.warn(
              `breaker open: ${name} (5 consecutive transport failures — 30s cool-off, skips fail-open; resets on deploy)`,
            );
          }
        }
      }
    }
    // Idle-success (fanout path only): an admitted fetcher that ran
    // clean but contributed NOTHING (another fetcher won every field)
    // is transport-healthy — the half-open probe it carried PROVED the
    // provider is back, so the breaker closes. Contribution-based
    // success above would leave the breaker half-open forever when a
    // recovered provider keeps losing the merge. (Registry keeps its
    // pre-existing sources-only accounting — untouched.)
    if (args.outcomeIsAggregate) {
      for (const name of args.breakerAdmitted) {
        if (!knownFetcherNames.has(name)) {
          continue;
        }
        if (outcome.sources.includes(name) || name in outcome.errors) {
          continue;
        }
        const key = snapshotBreakerKey(name);
        const before = this.breaker?.getState(key);
        this.breaker?.recordSuccess(key);
        if (before !== undefined && before !== null && before !== 'closed') {
          this.logger.log(`breaker closed: ${name}`);
        }
      }
    }
    const providerErrors: Record<string, string> = { ...outcome.errors };
    for (const name of args.breakerSkipped) {
      providerErrors[name] =
        'breaker skip (open 30s cool-off or half-open probe busy) — fail-open (resets on deploy)';
    }
    if (args.governor !== null) {
      providerErrors[args.governor.key] = args.governor.value;
    }
    for (const [k, v] of Object.entries(tailNotes)) {
      providerErrors[k] = v;
    }
    // Public-RPC rotation audit (dexter plan todo 42): backoff
    // enter/exit notes ride the existing providerErrors channel (same
    // seam the governor/breaker read — no new metrics, no parallel
    // control loop). Drain-once per snapshot; null fastPath drains none.
    if (this.fastPath !== null && this.fastPath !== undefined) {
      const rotationNotes = this.fastPath.drainRotationNotes?.() ?? [];
      for (const note of rotationNotes) {
        providerErrors[note.key] = note.value;
      }
    }
    if (args.skipDevHoldings && kind === 'token') {
      // Fast card: dev holdings need their own aggregator round trip,
      // outside the 800ms budget by design — marked, never silent.
      providerErrors['dev:fast-path'] = 'skipped (fast-path budget)';
    }
    for (const [k, v] of Object.entries(devErrors)) {
      providerErrors[k] = v;
    }
    // Serve-stale floor (dexter plan todo 19b1, NO background
    // refresh by design): the request that finds providers down
    // replays the newest ready history row WITH the stale bit; the
    // NEXT request retries providers naturally (stale is never
    // cached, never re-persisted — see below). No cron/queue/timer/
    // fire-and-forget exists on this path, so the stampede and
    // unhandled-rejection classes are absent by construction.
    if (quoteFailed && devWallets === null) {
      const staleRow = await this.history.findLatestReady(
        id.key,
        kind,
        this.staleMaxAgeMs,
      );
      if (staleRow !== null) {
        const staleAsOf = staleRow.createdAt;
        const staleAgeMs = Date.now() - Date.parse(staleRow.createdAt);
        // Trio guard (todo 41c `no-bit-without-age`): a corrupt row
        // (unparseable timestamp) falls through to honest pending —
        // never a bit with no age.
        if (isStaleTrioValid(true, staleAsOf, staleAgeMs)) {
          const stale: AddressSnapshot = {
            chain: id.chain,
            address: id.address,
            kind: id.kind,
            key: id.key,
            status: 'ready',
            stale: true,
            staleAsOf,
            staleAgeMs,
            degraded: isTailDegraded(providerErrors),
            assetId: await this.resolveAssetId(
              knownId,
              inputValue,
              staleRow.quote,
            ),
            launchpad,
            venue,
            pairCreatedAt,
            fdvAth,
            providers: supporting,
            sources: [...staleRow.sources],
            providerErrors,
            ...emptySnapshotQuote(),
            ...staleRow.quote,
            devWallets: staleRow.quote.devWallets ?? null,
            devPctSupply: staleRow.quote.devPctSupply ?? null,
          };
          return { snapshot: stale, tailMs };
        }
      }
    }
    // Identity provenance + metadata last resort (dexter plan todo
    // 39): the fast path pins the source when IT names the token
    // (kept verbatim — never re-derived here). Otherwise the merged
    // quote decides: named by providers -> 'market'; unnamed Solana
    // token -> ONE lazy metadata read (post-merge, so no provider
    // data is ever shadowed; identity-less healthy path pays zero).
    // A metadata hit fills symbol/name ONLY — supply/holders/price
    // stay aggregator-owned (numbers N/A stay honest), and the card
    // status is untouched (a market-less hit still reads `pending`).
    const metadataIdentity =
      outcome.quote.identityProvenance !== null &&
      outcome.quote.identityProvenance !== undefined
        ? null
        : await this.resolveMetadataIdentity(
            knownId,
            kind,
            inputValue,
            quote,
            providerErrors,
          );
    const resolvedQuote: SnapshotQuote =
      metadataIdentity === null
        ? {
            ...quote,
            identityProvenance:
              outcome.quote.identityProvenance ??
              (quote.symbol !== null || quote.name !== null ? 'market' : null),
          }
        : {
            ...quote,
            symbol: metadataIdentity.symbol ?? quote.symbol,
            name: metadataIdentity.name ?? quote.name,
            identityProvenance: 'metadata',
          };
    const snapshot: AddressSnapshot = {
      chain: id.chain,
      address: id.address,
      kind: id.kind,
      key: id.key,
      status: quoteFailed && devWallets === null ? 'pending' : 'ready',
      stale: false,
      staleAsOf: null,
      staleAgeMs: null,
      degraded: isTailDegraded(providerErrors),
      assetId: await this.resolveAssetId(knownId, inputValue, resolvedQuote),
      launchpad,
      venue,
      pairCreatedAt,
      fdvAth,
      providers: supporting,
      sources,
      providerErrors,
      ...emptySnapshotQuote(),
      ...resolvedQuote,
      devWallets,
      devPctSupply,
    };
    await this.history.save({
      key: snapshot.key,
      chain: snapshot.chain,
      address: snapshot.address,
      kind: snapshot.kind,
      status: snapshot.status,
      quote: {
        ...resolvedQuote,
        devWallets,
        devPctSupply,
      },
      sources,
      providerErrors,
    });
    if (this.cache && snapshot.status !== 'pending') {
      // Robust-nulls (plan todo 19a): pending snapshots are NEVER
      // cached — a cached pending shell freezes a transient miss for
      // the full TTL (P12: `x-cache: HIT`, zero provider traffic).
      // The store honors any TTL (`CachePort.set` takes `ttlSeconds`,
      // in-memory applies it verbatim), so skip-write needs no
      // short-TTL fallback. History still persists pending rows (19b
      // SWR + fdvAth read them). Stale-served snapshots never reach
      // this line (early return above: no re-persist, no cache write
      // — the bound window never re-anchors and the next request
      // retries providers).
      await this.cache.set(cacheKey, snapshot, SNAPSHOT_CACHE_TTL_SECONDS);
    }
    if (snapshot.status === 'pending') {
      this.nullMetrics?.record(
        deriveSnapshotNullReason({ servedFromCache: false, providerErrors }),
      );
    }
    return { snapshot, tailMs };
  }
}
