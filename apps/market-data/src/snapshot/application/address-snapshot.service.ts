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
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import type { LaunchpadInfo } from 'launchpad/domain/launchpad-info';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import {
  GECKO_NETWORK_SLUGS,
  GECKO_SUPPORTED_CHAINS,
} from 'provider/infrastructure/quote-fetchers/provider-quote.fetchers';
import { selectPoolQuote } from 'provider/infrastructure/geckoterminal';
import { toVenueOrNull, type SnapshotVenue } from '../domain/snapshot-venue';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import {
  deriveSnapshotNullReason,
  SnapshotNullMetricsService,
} from './snapshot-null-metrics.service';
import { applyOutboundRateLimit } from 'provider/infrastructure/quote-fetchers/rate-limited-fetchers';
import { applySingleRetryFetchers } from 'provider/infrastructure/quote-fetchers/fetcher-retry';
import { DevHoldingsPort } from '../../holders/domain/holdings.port';
import { AssetResolverService } from 'asset-registry/application/asset-resolver.service';
import {
  DIRECT_FAST_PATH_DEADLINE_MS,
  DirectFastPathService,
} from './direct-fast-path.service';
import {
  selectPreferredQuote,
  TOLERANCE_DEFAULT_BPS,
} from 'provider/infrastructure/onchain/evm-tolerance';

/** Log helper: nullable ms renders as `n/a` (never crashes the line). */
const roundMs = (ms: number | null): string =>
  ms === null ? 'n/a' : String(Math.round(ms));

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
  ) {}

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
        const best = await this.dexscreener.getBestPairSummaryForChain(
          chain,
          address,
        );
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
    const retried = applySingleRetryFetchers(gated);
    // Direct fast-path FIRST (todo 22 wire-up): the fan-out starts
    // IMMEDIATELY and the on-chain readers race a HARD deadline
    // against it. Sane direct values serve at direct speed while the
    // in-flight fan-out completes in background for the log-only
    // tolerance check (no second run). ANY direct miss (no coverage,
    // timeout, insane values) awaits the already-running fan-out —
    // the fallback path below is byte-identical and pays ~zero
    // direct penalty when the miss is fast (instant-null coverage).
    const fanoutP = this.aggregator.aggregate(known.id, input.value, retried);
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
      const snapshot = await this.buildSnapshot({
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
      });
      this.logger.log(
        `direct-fast-path chain=${known.id} served=fast directMs=${directMs} ` +
          `discoveryMs=${roundMs(fast.timings.discoveryMs)} ` +
          `kindMs=${kindMs} ` +
          `totalMs=${Math.round(performance.now() - startedAt)}`,
      );
      this.compareToleranceInBackground(
        fanoutP,
        known.id,
        input.value,
        fast.outcome.quote,
      );
      return snapshot;
    }
    const fanoutStartedAt = performance.now();
    const outcome = await fanoutP;
    const fanoutMs = Math.round(performance.now() - fanoutStartedAt);
    const snapshot = await this.buildSnapshot({
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
    });
    this.logger.log(
      `direct-fast-path chain=${known.id} served=fanout directMs=${directMs} ` +
        `fanoutMs=${fanoutMs} kindMs=${kindMs} ` +
        `totalMs=${Math.round(performance.now() - startedAt)}`,
    );
    return snapshot;
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
  }): Promise<AddressSnapshot> {
    const { knownId, inputValue, cacheKey, kind, id, supporting, outcome } =
      args;
    const launchpad = args.launchpad.resolved
      ? args.launchpad.value
      : await this.resolveLaunchpad(knownId, inputValue);
    const venue = args.venue.resolved
      ? args.venue.value
      : await this.resolveVenue(knownId, inputValue);
    // FDV ATH is strictly historical: read BEFORE the current row is
    // persisted, so cold-start (no history) resolves null and the
    // in-flight FDV is never substituted as ATH (spec-pinned).
    const fdvAth = await this.history.findFdvAth(knownId, inputValue);
    for (const source of outcome.sources) {
      this.providers.recordSuccess(source, 0);
    }
    for (const name of Object.keys(outcome.errors)) {
      if (!outcome.sources.includes(name)) {
        this.providers.recordFailure(name);
      }
    }
    let devWallets: AddressSnapshot['devWallets'] = null;
    let devPctSupply: number | null = null;
    const providerErrors: Record<string, string> = { ...outcome.errors };
    if (args.skipDevHoldings && kind === 'token') {
      // Fast card: dev holdings need their own aggregator round trip,
      // outside the 800ms budget by design — marked, never silent.
      providerErrors['dev:fast-path'] = 'skipped (fast-path budget)';
    }
    if (kind === 'token' && this.devHoldings && !args.skipDevHoldings) {
      try {
        const dev = await this.devHoldings.resolve(knownId, inputValue);
        devWallets = dev.devWallets ?? null;
        devPctSupply = dev.devPctSupply;
        for (const [k, v] of Object.entries(dev.providerErrors)) {
          providerErrors[`dev:${k}`] = v;
        }
      } catch {
        devWallets = null;
        devPctSupply = null;
      }
    }
    // Serve-stale floor (dexter plan todo 19b1, NO background
    // refresh by design): the request that finds providers down
    // replays the newest ready history row WITH the stale bit; the
    // NEXT request retries providers naturally (stale is never
    // cached, never re-persisted — see below). No cron/queue/timer/
    // fire-and-forget exists on this path, so the stampede and
    // unhandled-rejection classes are absent by construction.
    if (outcome.allFailed && devWallets === null) {
      const staleRow = await this.history.findLatestReady(
        id.key,
        kind,
        this.staleMaxAgeMs,
      );
      if (staleRow !== null) {
        return {
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
      }
    }
    const snapshot: AddressSnapshot = {
      chain: id.chain,
      address: id.address,
      kind: id.kind,
      key: id.key,
      status: outcome.allFailed && devWallets === null ? 'pending' : 'ready',
      stale: false,
      staleAsOf: null,
      staleAgeMs: null,
      assetId: await this.resolveAssetId(knownId, inputValue, outcome.quote),
      launchpad,
      venue,
      fdvAth,
      providers: supporting,
      sources: outcome.sources,
      providerErrors,
      ...emptySnapshotQuote(),
      ...outcome.quote,
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
        ...outcome.quote,
        devWallets,
        devPctSupply,
      },
      sources: outcome.sources,
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
    return snapshot;
  }
}
