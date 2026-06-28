import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'token/enrichment/domain/ports/market-data-provider.port';
import { BirdeyeService } from 'data-provider/birdeye/birdeye.service';

/**
 * Thin wrapper that delegates to `BirdeyeService`.
 *
 * Maintains backward compatibility: same `@Injectable()` decorator,
 * same `MarketDataProviderPort` extension, same constructor footprint.
 */
@Injectable()
export class BirdeyeAdapter extends MarketDataProviderPort {
  public readonly name = 'birdeye';
  private readonly logger = new Logger(BirdeyeAdapter.name);

  public constructor(private readonly service: BirdeyeService) {
    super();
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    if (chain.value !== 'solana') {
      this.logger.warn(
        `BirdeyeAdapter invoked with non-solana chain: ${chain.value}`,
      );
      return null;
    }
    const overview = await this.service.getTokenOverview(address);
    if (!overview) return null;
    return {
      pairs: [],
      priceUsd: overview.price,
      liquidityUsd: overview.liquidity,
      volume24hUsd: overview.volume24h,
      marketCapUsd: overview.mc,
      fdvUsd: null,
      priceChange24h: overview.priceChange24h,
      holders: overview.holder,
      top10HolderPercent: null,
      name: overview.name,
      symbol: overview.symbol,
      imageUrls: [`https://cdn.birdeye.so/tokens/${address}/logo.png`],
      lockedLiquidityPercent: null,
      burnedPercent: null,
    };
  }
}
