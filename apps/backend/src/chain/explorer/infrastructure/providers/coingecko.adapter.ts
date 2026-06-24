import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'chain/explorer/domain/ports/market-data-provider.port';

interface AppConfigShape {
  readonly coingecko: { readonly apiKey: string };
}

interface CoinGeckoImage {
  readonly thumb?: string | null;
  readonly small?: string | null;
  readonly large?: string | null;
}

interface CoinGeckoResponse {
  readonly image?: CoinGeckoImage | null;
  readonly market_data?: {
    readonly current_price?: { readonly usd?: number | null };
    readonly market_cap?: { readonly usd?: number | null };
    readonly fully_diluted_valuation?: { readonly usd?: number | null };
    readonly total_volume?: { readonly usd?: number | null };
    readonly price_change_percentage_24h?: number | null;
  };
}

function extractImageUrls(image: CoinGeckoImage | null | undefined): string[] {
  if (!image) return [];
  const candidates = [image.large, image.small, image.thumb];
  return Array.from(
    new Set(
      candidates.filter(
        (url): url is string =>
          typeof url === 'string' && url.length > 0 && /^https?:\/\//.test(url),
      ),
    ),
  );
}

const PLATFORM_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  bsc: 'binance-smart-chain',
  base: 'base',
  arbitrum: 'arbitrum-one',
  polygon: 'polygon-pos',
  solana: 'solana',
};

/**
 * CoinGecko market data provider — multi-chain fallback for price/MC/FDV.
 *
 * Requires `COINGECKO_API_KEY` (Demo plan — ~30 req/min). Intended as a
 * fallback when DexScreener, GeckoTerminal, Mobula, and Birdeye all
 * lack data. CoinGecko indexes established tokens faster than aggregators
 * for blue chips, but lags behind for fresh launches.
 *
 * Does NOT return liquidityUsd or holders — this is a price-only fallback.
 */
@Injectable()
export class CoinGeckoAdapter extends MarketDataProviderPort {
  public readonly name = 'coingecko';

  private readonly logger = new Logger(CoinGeckoAdapter.name);
  private readonly apiKey: string | null;
  private static readonly ENDPOINT = 'https://api.coingecko.com/api/v3/coins';

  public constructor(configService: ConfigService) {
    super();
    const cfg = configService.get<AppConfigShape>('app');
    this.apiKey = cfg?.coingecko?.apiKey || null;
    if (!this.apiKey) {
      this.logger.warn(
        'COINGECKO_API_KEY missing — CoinGecko provider will return null',
      );
    }
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    const platform = PLATFORM_MAP[chain.value];
    if (!platform) return null;
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<CoinGeckoResponse>(
        `${CoinGeckoAdapter.ENDPOINT}/${platform}/contract/${address}`,
        {
          headers: { 'x-cg-demo-api-key': this.apiKey },
          timeout: 8000,
        },
      );
      const md = data.market_data;
      if (!md) return null;
      const priceUsd = md.current_price?.usd ?? null;
      const marketCapUsd = md.market_cap?.usd ?? null;
      if (priceUsd === null && marketCapUsd === null) return null;
      return {
        pairs: [],
        priceUsd,
        liquidityUsd: null,
        volume24hUsd: md.total_volume?.usd ?? null,
        marketCapUsd,
        fdvUsd: md.fully_diluted_valuation?.usd ?? null,
        priceChange24h: md.price_change_percentage_24h ?? null,
        holders: null,
        top10HolderPercent: null,
        totalSupply: null,
        insidersPercent: null,
        bundlersPercent: null,
        devPercent: null,
        bondingPercent: null,
        factory: null,
        name: null,
        imageUrls: extractImageUrls(data.image),
        lockedLiquidityPercent: null,
        burnedPercent: null,
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`CoinGecko fetch failed: ${(err as Error).message}`);
      return null;
    }
  }
}
