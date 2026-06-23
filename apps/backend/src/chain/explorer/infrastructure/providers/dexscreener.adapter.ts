import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'chain/explorer/domain/ports/market-data-provider.port';

interface DexScreenerPair {
  pairAddress: string;
  dexId: string;
  baseToken: { address: string; symbol: string; name: string };
  quoteToken: { symbol: string };
  priceUsd: string | null;
  priceChange: { h24: number | null } | null;
  volume: { h24: number | null } | null;
  liquidity: { usd: number | null } | null;
  fdv: number | null;
  marketCap: number | null;
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

@Injectable()
export class DexScreenerAdapter extends MarketDataProviderPort {
  public readonly name = 'dexscreener';

  private readonly logger = new Logger(DexScreenerAdapter.name);
  private static readonly ENDPOINT =
    'https://api.dexscreener.com/latest/dex/tokens';

  public async fetch(
    _chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    try {
      const { data } = await axios.get<DexScreenerResponse>(
        `${DexScreenerAdapter.ENDPOINT}/${address}`,
        { timeout: 5000 },
      );
      if (!data.pairs || data.pairs.length === 0) return null;
      return this.toMarketData(data.pairs, _chain.value);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`DexScreener fetch failed: ${(err as Error).message}`);
      throw err;
    }
  }

  private toMarketData(
    pairs: DexScreenerPair[],
    chainSlug: string,
  ): MarketData {
    const best = pairs.reduce((acc, p) => {
      const liq = p.liquidity?.usd ?? 0;
      return liq > (acc.liquidity?.usd ?? 0) ? p : acc;
    }, pairs[0]);

    const mappedPairs = pairs.map((p) => ({
      address: p.pairAddress,
      dexId: p.dexId,
      quoteToken: p.quoteToken.symbol,
      reserveUsd: p.liquidity?.usd ?? 0,
    }));

    return {
      pairs: mappedPairs,
      priceUsd: best.priceUsd ? parseFloat(best.priceUsd) : null,
      liquidityUsd: best.liquidity?.usd ?? null,
      volume24hUsd: best.volume?.h24 ?? null,
      marketCapUsd: best.marketCap ?? null,
      fdvUsd: best.fdv ?? null,
      priceChange24h: best.priceChange?.h24 ?? null,
      holders: null,
      top10HolderPercent: null,
      name: best.baseToken.name || null,
      imageUrls: [
        `https://dd.dexscreener.com/ds-data/tokens/${chainSlug}/${best.baseToken.address}.png`,
      ],
      lockedLiquidityPercent: null,
      burnedPercent: null,
    };
  }
}
