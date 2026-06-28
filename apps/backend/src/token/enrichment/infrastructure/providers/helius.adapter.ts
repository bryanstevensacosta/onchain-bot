import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'token/enrichment/domain/ports/market-data-provider.port';
import { HeliusService } from 'data-provider/helius/helius.service';

/**
 * Thin wrapper that delegates to `HeliusService.getTokenAccounts`.
 *
 * Maintains backward compatibility: same decorator, same port, same
 * constructor footprint. Only `holders` is populated; all other market
 * fields are `null` (downstream first-non-null merge handles the rest).
 */
@Injectable()
export class HeliusAdapter extends MarketDataProviderPort {
  public readonly name = 'helius';
  private readonly logger = new Logger(HeliusAdapter.name);

  public constructor(private readonly service: HeliusService) {
    super();
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    if (chain.value !== 'solana') {
      this.logger.warn(
        `HeliusAdapter invoked with non-solana chain: ${chain.value}`,
      );
      return null;
    }
    const accounts = await this.service.getTokenAccounts(address);
    return {
      pairs: [],
      priceUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      priceChange24h: null,
      holders: accounts?.holders ?? null,
      top10HolderPercent: null,
      name: null,
      symbol: null,
      imageUrls: [],
      lockedLiquidityPercent: null,
      burnedPercent: null,
    };
  }
}
