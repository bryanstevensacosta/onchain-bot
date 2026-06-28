import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'token/enrichment/domain/ports/market-data-provider.port';
import { CoinGeckoService } from 'data-provider/coingecko/coingecko.service';

const PLATFORM_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  bsc: 'binance-smart-chain',
  base: 'base',
  arbitrum: 'arbitrum-one',
  polygon: 'polygon-pos',
  solana: 'solana',
};

/**
 * Thin wrapper that delegates to `CoinGeckoService.getTokenContractInfo`.
 *
 * Chain resolution (PLATFORM_MAP) is kept in the adapter; the underlying
 * service is chain-agnostic. Intended as a fallback when DexScreener,
 * GeckoTerminal, Mobula, and Birdeye all lack data.
 *
 * Does NOT return liquidityUsd or holders — price/MC/FDV-only fallback.
 */
@Injectable()
export class CoinGeckoAdapter extends MarketDataProviderPort {
  public readonly name = 'coingecko';
  private readonly logger = new Logger(CoinGeckoAdapter.name);

  public constructor(private readonly service: CoinGeckoService) {
    super();
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    const platform = PLATFORM_MAP[chain.value];
    if (!platform) return null;

    const info = await this.service.getTokenContractInfo(platform, address);
    if (!info) return null;

    return {
      pairs: [],
      priceUsd: info.priceUsd,
      liquidityUsd: null,
      volume24hUsd: info.volumeUsdH24,
      marketCapUsd: info.marketCapUsd,
      fdvUsd: info.fdvUsd,
      priceChange24h: info.priceChangePercent24h,
      holders: null,
      top10HolderPercent: null,
      totalSupply: null,
      insidersPercent: null,
      bundlersPercent: null,
      devPercent: null,
      bondingPercent: null,
      factory: null,
      name: null,
      symbol: null,
      imageUrls: info.imageUrls,
      lockedLiquidityPercent: null,
      burnedPercent: null,
    };
  }
}
