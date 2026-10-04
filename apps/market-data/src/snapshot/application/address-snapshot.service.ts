import {
  Inject,
  Injectable,
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
  type QuoteFetcher,
} from '../domain/snapshot-quote.types';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { AggregationPolicyPort } from 'aggregators/domain/aggregation-policy.port';
import { LaunchpadDetectorService } from 'provider/launchpad/application/launchpad-detector.service';
import type { LaunchpadInfo } from 'provider/launchpad/domain/launchpad-info';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { applyOutboundRateLimit } from 'provider/infrastructure/quote-fetchers/rate-limited-fetchers';
import { DevHoldingsPort } from '../../holders/domain/holdings.port';
import { AssetResolverService } from 'asset-registry/application/asset-resolver.service';

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

  public async getSnapshot(
    input: AddressSnapshotInput,
  ): Promise<AddressSnapshot> {
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
    const id = AddressIdVo.from(known.id, input.value, kind);
    const supporting = this.providers
      .listProviders()
      .filter((provider) => provider.supportsChains.includes(known.id))
      .map((provider) => provider.name);
    const cacheKey = `snapshot:${id.chain}:${id.address}:${id.kind}`;
    if (this.cache) {
      const cached = await this.cache.get<AddressSnapshot>(cacheKey);
      if (cached !== null) {
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
    const outcome = await this.aggregator.aggregate(
      known.id,
      input.value,
      gated,
    );
    const launchpad = await this.resolveLaunchpad(known.id, input.value);
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
    if (kind === 'token' && this.devHoldings) {
      try {
        const dev = await this.devHoldings.resolve(known.id, input.value);
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
    const snapshot: AddressSnapshot = {
      chain: id.chain,
      address: id.address,
      kind: id.kind,
      key: id.key,
      status: outcome.allFailed && devWallets === null ? 'pending' : 'ready',
      assetId: await this.resolveAssetId(known.id, input.value, outcome.quote),
      launchpad,
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
    if (this.cache) {
      await this.cache.set(cacheKey, snapshot, SNAPSHOT_CACHE_TTL_SECONDS);
    }
    return snapshot;
  }
}
