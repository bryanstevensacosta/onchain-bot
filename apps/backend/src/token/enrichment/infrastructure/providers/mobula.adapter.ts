import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'token/enrichment/domain/ports/market-data-provider.port';
import { MobulaService } from 'data-provider/mobula/mobula.service';

const CHAIN_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
  solana: 'solana',
};

/**
 * Thin wrapper that delegates to `MobulaService.getTokenMarkets`.
 *
 * Maintains backward compatibility. Multi-chain (EVM + Solana).
 * Returns null gracefully when the token is unknown on the requested chain.
 */
@Injectable()
export class MobulaAdapter extends MarketDataProviderPort {
  public readonly name = 'mobula';
  private readonly logger = new Logger(MobulaAdapter.name);

  public constructor(private readonly service: MobulaService) {
    super();
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    const blockchain = CHAIN_MAP[chain.value];
    if (!blockchain) return null;
    const base = await this.service.getTokenMarkets(address, blockchain);
    if (!base) return null;
    return {
      pairs: [],
      priceUsd: base.priceUSD ?? null,
      liquidityUsd: base.approximateReserveUSD ?? null,
      volume24hUsd: null,
      marketCapUsd: base.marketCapUSD ?? null,
      fdvUsd: base.marketCapDilutedUSD ?? null,
      priceChange24h: null,
      holders: null,
      top10HolderPercent: base.top10HoldingsPercentage ?? null,
      totalSupply: base.totalSupply ?? null,
      insidersPercent: base.insidersHoldingsPercentage ?? null,
      bundlersPercent: base.bundlersHoldingsPercentage ?? null,
      devPercent: base.devHoldingsPercentage ?? null,
      bondingPercent: base.bondingPercentage ?? null,
      factory: base.factory ?? base.source ?? null,
      name: null,
      symbol: null,
      imageUrls: [],
      lockedLiquidityPercent: null,
      burnedPercent: null,
    };
  }
}
