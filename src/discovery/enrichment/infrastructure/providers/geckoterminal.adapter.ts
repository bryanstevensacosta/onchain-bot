import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'discovery/enrichment/domain/ports/market-data-provider.port';

interface GeckoTerminalAttributes {
  address: string;
  name: string;
  symbol: string;
  total_supply: string | null;
  decimals: number | null;
  holders: { count: number } | null;
  top_10_percent_holders: string | null;
  gt_score: number | null;
  price_usd: string | null;
  fdv_usd: string | null;
  market_cap_usd: string | null;
  volume_usd: { h24: string | null } | null;
  price_change_percentage: { h24: string | null } | null;
}

interface GeckoTerminalResponse {
  data: {
    id: string;
    type: string;
    attributes: GeckoTerminalAttributes;
  };
}

const CHAIN_TO_GT_SLUG: Record<ChainId['value'], string | null> = {
  ethereum: 'eth',
  bsc: 'bsc',
  polygon: 'polygon_pos',
  base: 'base',
  arbitrum: 'arbitrum',
  solana: 'solana',
  unknown: null,
};

/**
 * GeckoTerminal market data provider.
 *
 * Free tier, no API key required.
 * Endpoint: GET https://api.geckoterminal.com/api/v2/networks/{chain}/tokens/{address}/info
 *
 * Best for: holders count, top10 holder concentration, GT score.
 * Limited chains (no Sui/Aptos) but high-quality aggregated data.
 */
@Injectable()
export class GeckoTerminalAdapter extends MarketDataProviderPort {
  public readonly name = 'geckoterminal';
  public readonly supportedChains: ReadonlyArray<ChainId> = [
    ChainId.ETHEREUM,
    ChainId.SOLANA,
    ChainId.BSC,
    ChainId.BASE,
    ChainId.ARBITRUM,
    ChainId.POLYGON,
  ];

  private readonly logger = new Logger(GeckoTerminalAdapter.name);
  private static readonly BASE = 'https://api.geckoterminal.com/api/v2';

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    const slug = CHAIN_TO_GT_SLUG[chain.value];
    if (!slug) return null;
    try {
      const { data } = await axios.get<GeckoTerminalResponse>(
        `${GeckoTerminalAdapter.BASE}/networks/${slug}/tokens/${address}/info`,
        { timeout: 5000 },
      );
      const a = data.data.attributes;
      return {
        pairs: [],
        priceUsd: a.price_usd ? parseFloat(a.price_usd) : null,
        liquidityUsd: null,
        volume24hUsd: a.volume_usd?.h24 ? parseFloat(a.volume_usd.h24) : null,
        marketCapUsd: a.market_cap_usd ? parseFloat(a.market_cap_usd) : null,
        fdvUsd: a.fdv_usd ? parseFloat(a.fdv_usd) : null,
        priceChange24h: a.price_change_percentage?.h24
          ? parseFloat(a.price_change_percentage.h24)
          : null,
        holders: a.holders?.count ?? null,
        top10HolderPercent: a.top_10_percent_holders
          ? parseFloat(a.top_10_percent_holders)
          : null,
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `GeckoTerminal fetch failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
