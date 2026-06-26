import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  CHAIN_CATALOG,
  ChainCatalogPort,
} from 'chain/registry/domain/ports/chain-catalog.port';
import {
  MarketData,
  MarketDataProviderPort,
} from '../../domain/ports/market-data-provider.port';
import { MARKET_DATA_PROVIDERS } from '../../chain-explorer.tokens';
import { TokenSnapshot } from '../../domain/entities/token-snapshot.entity';
import { Pair } from '../../domain/value-objects/pair.vo';
import { TokenSnapshotRepository } from '../ports/token-snapshot.repository';
import { EnrichmentEventPublisher } from '../ports/enrichment-event.publisher';
import {
  TokenSnapshotMapper,
  TokenSnapshotView,
} from '../mappers/token-snapshot.mapper';
import { EnrichmentFailedEvent } from '../../domain/events/enrichment-failed.event';

export interface EnrichTokenInput {
  readonly chain: string;
  readonly address: string;
  /** Optional: skip cache and force re-fetch. */
  readonly force?: boolean;
}

export interface EnrichResult {
  readonly snapshot: TokenSnapshotView;
  readonly errors: ReadonlyArray<{ provider: string; message: string }>;
}

/**
 * Use case: aggregate market data from all configured providers into
 * a single TokenSnapshot.
 *
 * Logic:
 * 1. Filter providers by `chain` (skip ones that don't support it).
 * 2. Run them in parallel (Promise.allSettled).
 * 3. Merge results: first non-null per field wins (configurable order).
 * 4. Build TokenSnapshot from merged data.
 * 5. Persist + emit `TokenEnrichedEvent`.
 *
 * If ALL providers fail or return null → emit `EnrichmentFailedEvent`
 * and still return a view (with all null fields + errors list).
 *
 * Cache: cached snapshot returned unless `force: true` or cache stale
 * (> MAX_CACHE_AGE_MS).
 */
@Injectable()
export class EnrichTokenUseCase {
  private static readonly MAX_CACHE_AGE_MS = 5 * 60 * 1000; // 5 minutes
  private readonly logger = new Logger(EnrichTokenUseCase.name);

  public constructor(
    @Inject(MARKET_DATA_PROVIDERS)
    private readonly providers: ReadonlyArray<MarketDataProviderPort>,
    @Inject(CHAIN_CATALOG)
    private readonly catalog: ChainCatalogPort,
    private readonly snapshotRepo: TokenSnapshotRepository,
    private readonly eventPublisher: EnrichmentEventPublisher,
  ) {
    if (providers.length === 0) {
      throw new Error(
        'EnrichTokenUseCase requires at least one MarketDataProviderPort',
      );
    }
  }

  /**
   * Map generic chain hints emitted by upstream BCs to the canonical
   * ChainId values. The normalization BC currently emits `evm` for any
   * EVM address without a specific chain (eth/bsc/base/...). v1 only
   * supports Ethereum among EVMs, so `evm` resolves to `ethereum` here.
   * Once chain-detection BC disambiguates per-chain (v2), this alias
   * can be removed.
   */
  private static normalizeChain(raw: string): ChainId {
    const lowered = raw.toLowerCase();
    if (lowered === 'evm') {
      return ChainId.ETHEREUM;
    }
    return ChainId.fromString(lowered);
  }

  public async execute(input: EnrichTokenInput): Promise<EnrichResult> {
    const chain = EnrichTokenUseCase.normalizeChain(input.chain);
    const addressLower = input.address.toLowerCase();
    const addressForProviders =
      chain.value === 'solana' ? input.address : addressLower;

    if (!input.force) {
      const cached = await this.snapshotRepo.findByChainAndAddress(
        chain,
        addressLower,
      );
      if (cached && cached.isFresh(EnrichTokenUseCase.MAX_CACHE_AGE_MS)) {
        this.logger.debug(`Cache hit for ${chain.value}:${addressLower}`);
        return { snapshot: TokenSnapshotMapper.toView(cached), errors: [] };
      }
    }

    const chainEntity = await this.catalog.findById(chain);
    const hasMarketDataCapability =
      chainEntity?.supports('MARKET_DATA') ?? false;
    const applicable = hasMarketDataCapability ? this.providers : [];
    if (applicable.length === 0) {
      this.logger.warn(`No providers support chain: ${chain.value}`);
    }

    const settled = await Promise.allSettled(
      applicable.map((p) => p.fetch(chain, addressForProviders)),
    );

    const errors: Array<{ provider: string; message: string }> = [];
    const successful: Array<{ provider: string; data: MarketData }> = [];
    const allPairs: Array<Pair> = [];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const provider = applicable[i];
      if (result.status === 'rejected') {
        errors.push({
          provider: provider.name,
          message: (result.reason as Error).message,
        });
        continue;
      }
      if (result.value === null) {
        errors.push({ provider: provider.name, message: 'no data' });
        continue;
      }
      successful.push({ provider: provider.name, data: result.value });
      for (const pair of result.value.pairs) {
        allPairs.push(Pair.create(pair));
      }
    }

    const dedupedPairs = dedupePairs(allPairs);
    const merged = mergeMarketData(successful.map((s) => s.data));
    const sources = successful.map((s) => s.provider);

    const snapshot = TokenSnapshot.create({
      chain,
      address: addressLower,
      pairs: dedupedPairs,
      priceUsd: merged.priceUsd,
      liquidityUsd: merged.liquidityUsd,
      volume24hUsd: merged.volume24hUsd,
      marketCapUsd: merged.marketCapUsd,
      fdvUsd: merged.fdvUsd,
      priceChange24h: merged.priceChange24h,
      holders: merged.holders,
      top10HolderPercent: merged.top10HolderPercent,
      symbol: merged.symbol,
      name: merged.name,
      imageUrls: merged.imageUrls,
      lockedLiquidityPercent: merged.lockedLiquidityPercent,
      burnedPercent: merged.burnedPercent,
      sources,
    });

    await this.snapshotRepo.save(snapshot);

    if (snapshot.hasMarketData()) {
      snapshot.emitEnriched();
      await this.eventPublisher.publishAll(snapshot.commit());
    } else {
      const failedEvent = new EnrichmentFailedEvent({
        chain: chain.value,
        address: addressLower,
        errors,
        failedAt: new Date(),
      });
      await this.eventPublisher.publish(failedEvent);
    }

    return { snapshot: TokenSnapshotMapper.toView(snapshot), errors };
  }
}

function mergeMarketData(data: ReadonlyArray<MarketData>): {
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  priceChange24h: number | null;
  holders: number | null;
  top10HolderPercent: number | null;
  symbol: string | null;
  name: string | null;
  imageUrls: ReadonlyArray<string>;
  lockedLiquidityPercent: number | null;
  burnedPercent: number | null;
} {
  const first = <T>(getter: (d: MarketData) => T | null): T | null => {
    for (const d of data) {
      const v = getter(d);
      if (v !== null) return v;
    }
    return null;
  };
  const allImageUrls: string[] = [];
  for (const d of data) {
    for (const url of d.imageUrls) {
      if (!allImageUrls.includes(url)) {
        allImageUrls.push(url);
      }
    }
  }
  return {
    priceUsd: first((d) => d.priceUsd),
    liquidityUsd: first((d) => d.liquidityUsd),
    volume24hUsd: first((d) => d.volume24hUsd),
    marketCapUsd: first((d) => d.marketCapUsd),
    fdvUsd: first((d) => d.fdvUsd),
    priceChange24h: first((d) => d.priceChange24h),
    holders: first((d) => d.holders),
    top10HolderPercent: first((d) => d.top10HolderPercent),
    symbol: first((d) => d.symbol),
    name: first((d) => d.name),
    imageUrls: Object.freeze(allImageUrls),
    lockedLiquidityPercent: first((d) => d.lockedLiquidityPercent),
    burnedPercent: first((d) => d.burnedPercent),
  };
}

function dedupePairs(pairs: ReadonlyArray<Pair>): ReadonlyArray<Pair> {
  const seen = new Map<string, Pair>();
  for (const p of pairs) {
    const existing = seen.get(p.key);
    if (!existing || p.reserveUsd > existing.reserveUsd) {
      seen.set(p.key, p);
    }
  }
  return Array.from(seen.values());
}
