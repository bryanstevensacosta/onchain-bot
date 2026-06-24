import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'chain/explorer/domain/ports/market-data-provider.port';

interface AppConfigShape {
  readonly moralis: { readonly apiKey: string };
}

interface MoralisAnalyticsResponse {
  readonly usdPrice?: string | null;
  readonly totalLiquidityUsd?: string | null;
  readonly totalFullyDilutedValuation?: string | null;
  readonly pricePercentChange?: { readonly '24h'?: number | null };
}

interface MoralisHoldersResponse {
  readonly totalHolders?: string | number | null;
  readonly holderSupply?: {
    readonly top10?: { readonly supplyPercent?: string | number | null };
  };
}

interface MoralisMetadataResponse {
  readonly logo?: string | null;
  readonly logo_hash?: string | null;
}

const CHAIN_MAP: Record<string, string> = {
  ethereum: 'eth',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
};

/**
 * Moralis market data provider — EVM only.
 *
 * Requires `MORALIS_API_KEY`. Three parallel calls per fetch:
 *  1. `/tokens/{addr}/analytics?chain=eth` → price, liquidity, FDV, change
 *  2. `/erc20/{addr}/holders?chain=eth`    → totalHolders, top10 supply%
 *  3. `/token/{addr}/metadata?chain=eth`   → logo (image URL)
 *
 * Moralis uses chain slug `eth` (not `ethereum`), so the chain map is
 * required. Solana is not supported by Moralis — this adapter returns
 * null for it.
 */
@Injectable()
export class MoralisAdapter extends MarketDataProviderPort {
  public readonly name = 'moralis';

  private readonly logger = new Logger(MoralisAdapter.name);
  private readonly apiKey: string | null;
  private static readonly ANALYTICS_BASE =
    'https://deep-index.moralis.io/api/v2.2/tokens';
  private static readonly HOLDERS_BASE =
    'https://deep-index.moralis.io/api/v2.2/erc20';
  private static readonly METADATA_BASE =
    'https://deep-index.moralis.io/api/v2.2/erc20';

  public constructor(configService: ConfigService) {
    super();
    const cfg = configService.get<AppConfigShape>('app');
    this.apiKey = cfg?.moralis?.apiKey || null;
    if (!this.apiKey) {
      this.logger.warn(
        'MORALIS_API_KEY missing — Moralis provider will return null',
      );
    }
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    const chainSlug = CHAIN_MAP[chain.value];
    if (!chainSlug) return null;
    if (!this.apiKey) return null;

    try {
      const [analytics, holders, metadata] = await Promise.all([
        this.fetchAnalytics(address, chainSlug),
        this.fetchHolders(address, chainSlug),
        this.fetchMetadata(address, chainSlug),
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
    } catch (err) {
      this.logger.debug(`Moralis fetch failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async fetchAnalytics(
    address: string,
    chain: string,
  ): Promise<{
    priceUsd: number | null;
    liquidityUsd: number | null;
    fdvUsd: number | null;
    priceChange24h: number | null;
  } | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<MoralisAnalyticsResponse>(
        `${MoralisAdapter.ANALYTICS_BASE}/${address}/analytics`,
        {
          params: { chain },
          headers: { 'X-API-Key': this.apiKey },
          timeout: 8000,
        },
      );
      return {
        priceUsd: data.usdPrice ? parseFloat(data.usdPrice) : null,
        liquidityUsd: data.totalLiquidityUsd
          ? parseFloat(data.totalLiquidityUsd)
          : null,
        fdvUsd: data.totalFullyDilutedValuation
          ? parseFloat(data.totalFullyDilutedValuation)
          : null,
        priceChange24h: data.pricePercentChange?.['24h'] ?? null,
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Moralis /analytics failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async fetchHolders(
    address: string,
    chain: string,
  ): Promise<{
    holders: number | null;
    top10HolderPercent: number | null;
  } | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<MoralisHoldersResponse>(
        `${MoralisAdapter.HOLDERS_BASE}/${address}/holders`,
        {
          params: { chain },
          headers: { 'X-API-Key': this.apiKey },
          timeout: 8000,
        },
      );
      const rawTop10 = data.holderSupply?.top10?.supplyPercent;
      const top10 =
        typeof rawTop10 === 'string'
          ? parseFloat(rawTop10)
          : (rawTop10 ?? null);
      const rawHolders = data.totalHolders;
      const holders =
        typeof rawHolders === 'string'
          ? parseInt(rawHolders, 10)
          : (rawHolders ?? null);
      return { holders, top10HolderPercent: top10 };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Moralis /holders failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async fetchMetadata(
    address: string,
    chain: string,
  ): Promise<MoralisMetadataResponse | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<MoralisMetadataResponse[]>(
        `${MoralisAdapter.METADATA_BASE}/metadata`,
        {
          params: { chain, addresses: address },
          headers: { 'X-API-Key': this.apiKey },
          timeout: 8000,
        },
      );
      const match = Array.isArray(data) ? data[0] : null;
      return match ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Moralis /metadata failed: ${(err as Error).message}`);
      return null;
    }
  }

  private buildImageUrls(logo: string | null | undefined): string[] {
    if (!logo) return [];
    if (!/^https?:\/\//i.test(logo)) return [];
    return [logo];
  }
}
