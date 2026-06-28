import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'token/enrichment/domain/ports/market-data-provider.port';
import { MoralisService } from 'data-provider/moralis/moralis.service';

const CHAIN_MAP: Record<string, string> = {
  ethereum: 'eth',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
};

/**
 * Thin wrapper that delegates to `MoralisService`.
 *
 * Maintains backward compatibility. Three parallel calls per fetch:
 * analytics, holders, metadata — all delegating to the core service.
 */
@Injectable()
export class MoralisAdapter extends MarketDataProviderPort {
  public readonly name = 'moralis';
  private readonly logger = new Logger(MoralisAdapter.name);

  public constructor(private readonly service: MoralisService) {
    super();
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    const chainSlug = CHAIN_MAP[chain.value];
    if (!chainSlug) return null;

    const [analytics, holders, metadata] = await Promise.all([
      this.service.getTokenAnalytics(address, chainSlug),
      this.service.getTokenHolders(address, chainSlug),
      this.service.getTokenMetadata(address, chainSlug),
    ]);

    const imageUrls = this.buildImageUrls(metadata?.logo);
    const merged: MarketData = {
      pairs: [],
      priceUsd: analytics?.priceUsd ?? null,
      liquidityUsd: analytics?.liquidityUsd ?? null,
      volume24hUsd: null,
      marketCapUsd: analytics?.fdvUsd ?? null,
      fdvUsd: analytics?.fdvUsd ?? null,
      priceChange24h: analytics?.priceChange24h ?? null,
      holders: holders?.holders ?? null,
      top10HolderPercent: holders?.top10HolderPercent ?? null,
      totalSupply: null,
      insidersPercent: null,
      bundlersPercent: null,
      devPercent: null,
      bondingPercent: null,
      factory: null,
      name: null,
      symbol: null,
      imageUrls,
      lockedLiquidityPercent: null,
      burnedPercent: null,
    };

    if (
      merged.priceUsd === null &&
      merged.liquidityUsd === null &&
      merged.holders === null &&
      merged.top10HolderPercent === null
    ) {
      return null;
    }
    return merged;
  }

  private buildImageUrls(logo: string | null | undefined): string[] {
    if (!logo) return [];
    if (!/^https?:\/\//i.test(logo)) return [];
    return [logo];
  }
}
