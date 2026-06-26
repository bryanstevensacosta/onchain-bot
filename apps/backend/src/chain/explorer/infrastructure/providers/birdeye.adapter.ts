import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'chain/explorer/domain/ports/market-data-provider.port';

interface AppConfigShape {
  readonly birdeye: { readonly apiKey: string };
}

interface BirdeyeResponse {
  success: boolean;
  data: {
    address: string;
    price: number | null;
    priceChange24h: number | null;
    volume24h: number | null;
    liquidity: number | null;
    mc: number | null;
    totalSupply: number | null;
  } | null;
}

/**
 * Birdeye market data provider — Solana only.
 *
 * Requires API key (BIRDEYE_API_KEY env var). Premium quality Solana data:
 * - More accurate price than DexScreener for low-liquidity SPL tokens
 * - Better OHLCV (not used in v1)
 *
 * v2: chain capability filtering is done by the registry at injection
 * time. This adapter is only injected for chains where the registry
 * declares Birdeye as a market data source. The internal guard is
 * retained as a defensive check (logs warning instead of returning null).
 */
@Injectable()
export class BirdeyeAdapter extends MarketDataProviderPort {
  public readonly name = 'birdeye';

  private readonly logger = new Logger(BirdeyeAdapter.name);
  private readonly apiKey: string | null;

  public constructor(configService: ConfigService) {
    super();
    const cfg = configService.get<AppConfigShape>('app');
    this.apiKey = cfg?.birdeye?.apiKey || null;
    if (!this.apiKey) {
      this.logger.warn(
        'BIRDEYE_API_KEY missing — Birdeye provider will return null',
      );
    }
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
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<BirdeyeResponse>(
        'https://public-api.birdeye.so/defi/token_overview',
        {
          params: { address },
          headers: {
            'X-API-KEY': this.apiKey,
            'x-chain': 'solana',
          },
          timeout: 5000,
        },
      );
      if (!data.success || !data.data) return null;
      const d = data.data;
      return {
        pairs: [],
        priceUsd: d.price,
        liquidityUsd: d.liquidity,
        volume24hUsd: d.volume24h,
        marketCapUsd: d.mc,
        fdvUsd: null,
        priceChange24h: d.priceChange24h,
        holders: null,
        top10HolderPercent: null,
        name: null,
        symbol: null,
        imageUrls: [`https://cdn.birdeye.so/tokens/${address}/logo.png`],
        lockedLiquidityPercent: null,
        burnedPercent: null,
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Birdeye fetch failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
