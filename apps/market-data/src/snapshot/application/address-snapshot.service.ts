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
import {
  GECKO_NETWORK_SLUGS,
  GECKO_SUPPORTED_CHAINS,
} from 'provider/infrastructure/quote-fetchers/provider-quote.fetchers';
import { selectPoolQuote } from 'provider/infrastructure/geckoterminal';
import { toVenueOrNull, type SnapshotVenue } from '../domain/snapshot-venue';
import { deriveChange24hFromOhlcv } from '../domain/snapshot-ohlcv-change';
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

/** Log helper: nullable ms renders as `n/a` (never crashes the line). */
const roundMs = (ms: number | null): string =>
  ms === null ? 'n/a' : String(Math.round(ms));

/**
 * Snapshot-tail budgets (dexter plan todo 29 — the tail is the
 * launchpad/venue/dev extras that run AFTER the quote fan-out; the
 * 28 re-measurement attributes ~2.5-6s of cold p95 to this tail).
 */
export const SNAPSHOT_TAIL_CONCURRENCY = 3;
export const SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS = 400;

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
   */
  private async resolveVenue(
    chain: string,
    address: string,
  ): Promise<SnapshotVenue | null> {
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
          return toVenueOrNull({ dexId: best.dexId, labels: best.labels });
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
      return null;
    }
    try {
      const slug = GECKO_NETWORK_SLUGS[chain] ?? chain;
      const pools = await this.geckoterminal.getTokenPools(slug, address);
      const pick = selectPoolQuote(pools, address);
      if (pick === null || pick.dexId === null) return null;
      return toVenueOrNull({ dexId: pick.dexId, labels: [] });
    } catch {
      return null;
    }
  }

  /**
   * OHLC-derived 24h change (dexter plan todo 33, fallback leg).
   *
   * PRECEDENCE (structural, not advisory): a non-null `nativeChange`
   * — i.e. ANY native field surviving the fan-out merge (DexScreener,
   * Birdeye, CoinGecko, Moralis, Gecko `/info` itself) — returns null
   * here with ZERO extra calls, so natives always win. The leg fires
   * only when every native is null: pool discovery (same two-step as
   * the gecko fetcher: `getTokenPools`, then `searchPools` on miss)
   * plus ONE `hour/aggregate=1` OHLC call, then the exact-24h-window
   * math. Anything missing or out-of-window resolves null (fail-open,
   * never throws — same contract as `resolveVenue` above).
   */
  private async resolveDerivedChange24h(
    chain: string,
    address: string,
    nativeChange: number | null,
  ): Promise<number | null> {
    if (nativeChange !== null && nativeChange !== undefined) return null;
    if (
      this.geckoterminal === null ||
      this.geckoterminal === undefined ||
      !GECKO_SUPPORTED_CHAINS.includes(chain)
    ) {
      return null;
    }
    try {
      const slug = GECKO_NETWORK_SLUGS[chain] ?? chain;
      const pools = await this.geckoterminal.getTokenPools(slug, address);
      let pick = selectPoolQuote(pools, address);
      if (pick === null) {
        const searchPools = this.geckoterminal.searchPools?.bind(
          this.geckoterminal,
        );
        if (typeof searchPools !== 'function') return null;
        pick = selectPoolQuote(await searchPools(address), address);
      }
      if (pick === null || pick.poolAddress === null) return null;
      const candles = await this.geckoterminal.getPoolOhlcv(
        slug,
        pick.poolAddress,
        pick.side ?? 'base',
      );
      return deriveChange24hFromOhlcv(candles, Date.now());
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
    const startedAt = performance.now();
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
    const kindMs = Math.round(performance.now() - startedAt);
    const id = AddressIdVo.from(known.id, input.value, kind);
    const supporting = this.providers
      .listProviders()
      .filter((provider) => provider.supportsChains.includes(known.id))
      .map((provider) => provider.name);
    const cacheKey = `snapshot:${id.chain}:${id.address}:${id.kind}`;
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
      fetcher.supportsChains.includes(known.id),
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
            chain: known.id,
            address: input.value,
            fields: [...SNAPSHOT_QUOTE_FIELDS],
            quota: {},
            credits: {},
          });
    const gated = applyOutboundRateLimit(
      ordered,
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
      .aggregate(known.id, input.value, retried)
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
            { chain: known.id, address: input.value, kind },
            DIRECT_FAST_PATH_DEADLINE_MS,
          );
    const directMs = Math.round(performance.now() - fastStartedAt);
    if (fast !== null) {
      const built = await this.buildSnapshot({
        knownId: known.id,
        inputValue: input.value,
        cacheKey,
        kind,
        id,
        supporting,
        outcome: fast.outcome,
        launchpad: { resolved: true, value: fast.launchpad },
        venue: { resolved: true, value: fast.venue },
        skipDevHoldings: true,
        breakerSkipped: breakerGate.skipped,
        breakerAdmitted: [],
        outcomeIsAggregate: false,
      });
      this.logger.log(
        `direct-fast-path chain=${known.id} served=fast directMs=${directMs} ` +
          `discoveryMs=${roundMs(fast.timings.discoveryMs)} ` +
          `kindMs=${kindMs} tailMs=${built.tailMs} ` +
          `breakerSkipped=${breakerGate.skipped.length} ` +
          `totalMs=${Math.round(performance.now() - startedAt)}`,
      );
      this.compareToleranceInBackground(
        fanoutP,
        known.id,
        input.value,
        fast.outcome.quote,
      );
      return built.snapshot;
    }
    const fanoutStartedAt = performance.now();
    const outcome = await fanoutP;
    const fanoutMs = Math.round(performance.now() - fanoutStartedAt);
    const built = await this.buildSnapshot({
      knownId: known.id,
      inputValue: input.value,
      cacheKey,
      kind,
      id,
      supporting,
      outcome,
      launchpad: { resolved: false, value: null },
      venue: { resolved: false, value: null },
      skipDevHoldings: false,
      breakerSkipped: breakerGate.skipped,
      breakerAdmitted: breakerGate.admitted.map((fetcher) => fetcher.name),
      outcomeIsAggregate: true,
    });
    this.logger.log(
      `direct-fast-path chain=${known.id} served=fanout directMs=${directMs} ` +
        `fanoutMs=${fanoutMs} kindMs=${kindMs} tailMs=${built.tailMs} ` +
        `breakerSkipped=${breakerGate.skipped.length} ` +
        `totalMs=${Math.round(performance.now() - startedAt)}`,
    );
    return built.snapshot;
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
    let devWallets: AddressSnapshot['devWallets'] = null;
    let devPctSupply: number | null = null;
    const devErrors: Record<string, string> = {};
    for (let i = 0; i < tailSlots.length; i += 1) {
      const slot = tailSlots[i];
      const value = tailValues[i];
      if (slot === 'launchpad') {
        launchpad = (value as LaunchpadInfo | null) ?? null;
      } else if (slot === 'venue') {
        venue = (value as SnapshotVenue | null) ?? null;
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
    // OHLC-derived change (dexter plan todo 33): runs AFTER the tail,
    // outside the 400ms tail budget (pool discovery + one OHLC call
    // need seconds on throttled tiers — capping it would degrade the
    // leg to near-always-null). Fires only when the merged quote has
    // no native change, so healthy snapshots pay zero extra calls;
    // gap-path snapshots (already slow/pending-bound) absorb the leg.
    const derivedChange24h = await this.resolveDerivedChange24h(
      knownId,
      inputValue,
      outcome.quote.priceChange24h,
    );
    const quote: SnapshotQuote =
      derivedChange24h === null
        ? outcome.quote
        : { ...outcome.quote, priceChange24h: derivedChange24h };
    const sources =
      derivedChange24h === null
        ? outcome.sources
        : [...outcome.sources, 'geckoterminal-ohlcv'];
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
    for (const [k, v] of Object.entries(tailNotes)) {
      providerErrors[k] = v;
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
        const stale: AddressSnapshot = {
          chain: id.chain,
          address: id.address,
          kind: id.kind,
          key: id.key,
          status: 'ready',
          stale: true,
          staleAsOf: staleRow.createdAt,
          staleAgeMs: Date.now() - Date.parse(staleRow.createdAt),
          assetId: await this.resolveAssetId(
            knownId,
            inputValue,
            staleRow.quote,
          ),
          launchpad,
          venue,
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
    const snapshot: AddressSnapshot = {
      chain: id.chain,
      address: id.address,
      kind: id.kind,
      key: id.key,
      status: quoteFailed && devWallets === null ? 'pending' : 'ready',
      stale: false,
      staleAsOf: null,
      staleAgeMs: null,
      assetId: await this.resolveAssetId(knownId, inputValue, quote),
      launchpad,
      venue,
      fdvAth,
      providers: supporting,
      sources,
      providerErrors,
      ...emptySnapshotQuote(),
      ...quote,
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
        ...quote,
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
