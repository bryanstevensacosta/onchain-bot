import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'chain/explorer/domain/ports/market-data-provider.port';

interface AppConfigShape {
  readonly mobula: { readonly apiKey: string };
}

interface MobulaMarketToken {
  readonly address?: string;
  readonly priceUSD?: number | null;
  readonly approximateReserveUSD?: number | null;
  readonly marketCapUSD?: number | null;
  readonly marketCapDilutedUSD?: number | null;
  readonly totalSupply?: number | null;
  readonly top10HoldingsPercentage?: number | null;
  readonly insidersHoldingsPercentage?: number | null;
  readonly bundlersHoldingsPercentage?: number | null;
  readonly devHoldingsPercentage?: number | null;
  readonly bondingPercentage?: number | null;
  readonly factory?: string | null;
  readonly source?: string | null;
}

interface MobulaMarketResponse {
  readonly data?: ReadonlyArray<{
    readonly base?: MobulaMarketToken;
  }>;
}

const CHAIN_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
  solana: 'solana',
};

/**
 * Mobula v2 market data provider — multi-chain (EVM + Solana).
 *
 * Requires `MOBULA_API_KEY`. The v1 `/api/1/market/query` endpoint is
 * deprecated; this adapter uses `/api/2/token/markets` (POST params:
 * address + blockchain).
 *
 * Unique value vs other providers:
 * - top10HolderPercent (concentration)
 * - insidersPercent / bundlersPercent / devPercent (rug signals)
 * - bondingPercent (still on pump.fun bonding curve → risk)
 * - factory (pumpfun, raydium, uniswap — factory fingerprint)
 *
 * Multi-chain: returns null gracefully when the token is unknown on the
 * requested chain.
 */
@Injectable()
export class MobulaAdapter extends MarketDataProviderPort {
  public readonly name = 'mobula';

  private readonly logger = new Logger(MobulaAdapter.name);
  private readonly apiKey: string | null;
  private static readonly ENDPOINT =
    'https://api.mobula.io/api/2/token/markets';

  public constructor(configService: ConfigService) {
    super();
    const cfg = configService.get<AppConfigShape>('app');
    this.apiKey = cfg?.mobula?.apiKey || null;
    if (!this.apiKey) {
      this.logger.warn(
        'MOBULA_API_KEY missing — Mobula provider will return null',
      );
    }
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    const blockchain = CHAIN_MAP[chain.value];
    if (!blockchain) return null;
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<MobulaMarketResponse>(
        MobulaAdapter.ENDPOINT,
        {
          params: { address, blockchain },
          headers: { Authorization: this.apiKey },
          timeout: 8000,
        },
      );
      const base = data.data?.[0]?.base;
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
        imageUrls: [],
        lockedLiquidityPercent: null,
        burnedPercent: null,
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Mobula fetch failed: ${(err as Error).message}`);
      return null;
    }
  }
}
