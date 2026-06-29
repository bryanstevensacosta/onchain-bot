import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/core/data-provider.port';
import type { DexScreenerConfig } from './dexscreener.config';
import { DEXSCREENER_CONFIG } from './dexscreener.config';
import type {
  DexScreenerPair,
  DexScreenerPairsResponse,
  DexScreenerSearchResponse,
  DexScreenerTokenProfile,
  DexScreenerTokenBoost,
  DexScreenerOrdersResponse,
  DexScreenerOrder,
  DexScreenerMeta,
  DexScreenerPairSummary,
} from './dexscreener.types';

const BASE = 'https://api.dexscreener.com';

/**
 * DexScreener market data provider — free, no API key required.
 *
 * Covers 80+ DEXes across 40+ chains. Primary source for:
 * - Token pairs by address (cross-chain)
 * - Search by symbol/name/address
 * - Latest token profiles & boosts
 * - Order book data
 * - Trending metas
 *
 * Completely free — rate limited to 60 requests/minute.
 * No API key required for most endpoints.
 *
 * @see https://docs.dexscreener.com/api/reference
 */
@Injectable()
export class DexScreenerService extends DataProviderPort {
  public readonly name = 'dexscreener';
  protected readonly logger = new Logger(DexScreenerService.name);

  public constructor(@Inject(DEXSCREENER_CONFIG) _config: DexScreenerConfig) {
    super();
    this.logger.log(
      'DexScreener provider initialized (free, no API key required)',
    );
  }

  public async onModuleInit(): Promise<void> {
    this.logger.log('DexScreener provider ready — rate limit: 60 req/min');
  }

  // ───────────────────────────────────────────
  //  Token pairs (primary market data endpoint)
  // ───────────────────────────────────────────

  /**
   * Get all DEX pairs for a token by its contract address.
   * Cross-chain — returns pairs from every DEX/chain where the token is traded.
   */
  public async getPairsByToken(
    address: string,
  ): Promise<ReadonlyArray<DexScreenerPair> | null> {
    try {
      const { data } = await axios.get<DexScreenerPairsResponse>(
        `${BASE}/latest/dex/tokens/${address}`,
        { timeout: 8_000 },
      );
      return data.pairs ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `DexScreener getPairsByToken failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Get a specific DEX pair by chain ID and pair address.
   */
  public async getPairByAddress(
    chainId: string,
    pairAddress: string,
  ): Promise<DexScreenerPair | null> {
    try {
      const { data } = await axios.get<DexScreenerPairsResponse>(
        `${BASE}/latest/dex/pairs/${chainId}/${pairAddress}`,
        { timeout: 8_000 },
      );
      return data.pairs?.[0] ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `DexScreener getPairByAddress failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Search tokens/pairs by query (symbol, name, or address).
   */
  public async search(
    query: string,
  ): Promise<ReadonlyArray<DexScreenerPair> | null> {
    try {
      const { data } = await axios.get<DexScreenerSearchResponse>(
        `${BASE}/latest/dex/search`,
        { params: { q: query }, timeout: 8_000 },
      );
      return data.pairs ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`DexScreener search failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Get token pairs for a specific chain.
   */
  public async getPairsByChain(
    chainId: string,
    tokenAddress: string,
  ): Promise<ReadonlyArray<DexScreenerPair> | null> {
    try {
      const { data } = await axios.get<DexScreenerPairsResponse>(
        `${BASE}/token-pairs/v1/${chainId}/${tokenAddress}`,
        { timeout: 8_000 },
      );
      return data.pairs ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `DexScreener getPairsByChain failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ───────────────────────────────────────────
  //  Token profiles & boosts
  // ───────────────────────────────────────────

  /**
   * Get latest token profiles (newly listed tokens with metadata).
   */
  public async getLatestProfiles(): Promise<ReadonlyArray<DexScreenerTokenProfile> | null> {
    try {
      const { data } = await axios.get<ReadonlyArray<DexScreenerTokenProfile>>(
        `${BASE}/token-profiles/latest/v1`,
        { timeout: 8_000 },
      );
      return data ?? null;
    } catch (err) {
      this.logger.debug(
        `DexScreener getLatestProfiles failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Get recently updated token profiles.
   */
  public async getRecentUpdates(): Promise<ReadonlyArray<DexScreenerTokenProfile> | null> {
    try {
      const { data } = await axios.get<ReadonlyArray<DexScreenerTokenProfile>>(
        `${BASE}/token-profiles/recent-updates/v1`,
        { timeout: 8_000 },
      );
      return data ?? null;
    } catch (err) {
      this.logger.debug(
        `DexScreener getRecentUpdates failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Get latest token boosts (paid promotions).
   */
  public async getLatestBoosts(): Promise<ReadonlyArray<DexScreenerTokenBoost> | null> {
    try {
      const { data } = await axios.get<ReadonlyArray<DexScreenerTokenBoost>>(
        `${BASE}/token-boosts/latest/v1`,
        { timeout: 8_000 },
      );
      return data ?? null;
    } catch (err) {
      this.logger.debug(
        `DexScreener getLatestBoosts failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Get top boosted tokens.
   */
  public async getTopBoosts(): Promise<ReadonlyArray<DexScreenerTokenBoost> | null> {
    try {
      const { data } = await axios.get<ReadonlyArray<DexScreenerTokenBoost>>(
        `${BASE}/token-boosts/top/v1`,
        { timeout: 8_000 },
      );
      return data ?? null;
    } catch (err) {
      this.logger.debug(
        `DexScreener getTopBoosts failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ───────────────────────────────────────────
  //  Orders
  // ───────────────────────────────────────────

  /**
   * Get open orders for a token on a specific chain.
   */
  public async getOrders(
    chainId: string,
    tokenAddress: string,
  ): Promise<ReadonlyArray<DexScreenerOrder> | null> {
    try {
      const { data } = await axios.get<DexScreenerOrdersResponse>(
        `${BASE}/orders/v1/${chainId}/${tokenAddress}`,
        { timeout: 8_000 },
      );
      return data.pairs?.[0]?.orders ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `DexScreener getOrders failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ───────────────────────────────────────────
  //  Metas (trending)
  // ───────────────────────────────────────────

  /**
   * Get trending metas (aggregated market categories).
   */
  public async getTrendingMetas(): Promise<ReadonlyArray<DexScreenerMeta> | null> {
    try {
      const { data } = await axios.get<ReadonlyArray<DexScreenerMeta>>(
        `${BASE}/metas/trending/v1`,
        { timeout: 8_000 },
      );
      return data ?? null;
    } catch (err) {
      this.logger.debug(
        `DexScreener getTrendingMetas failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ───────────────────────────────────────────
  //  Token info (batch by chain)
  // ───────────────────────────────────────────

  /**
   * Get token info for one or more tokens on a specific chain (comma-separated).
   */
  public async getTokensInfo(
    chainId: string,
    tokenAddresses: string,
  ): Promise<ReadonlyArray<DexScreenerPair> | null> {
    try {
      const { data } = await axios.get<{
        readonly pairs?: ReadonlyArray<DexScreenerPair>;
      }>(`${BASE}/tokens/v1/${chainId}/${tokenAddresses}`, { timeout: 8_000 });
      return data.pairs ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `DexScreener getTokensInfo failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ───────────────────────────────────────────
  //  Convenience / aggregated methods
  // ───────────────────────────────────────────

  /**
   * Get the best-liquidity pair summary for a token.
   * Returns the pair with highest USD liquidity across all DEXes/chains.
   */
  public async getBestPairSummary(
    address: string,
  ): Promise<DexScreenerPairSummary | null> {
    const pairs = await this.getPairsByToken(address);
    if (!pairs || pairs.length === 0) return null;

    const best = pairs.reduce((acc, p) => {
      const liq = p.liquidity?.usd ?? 0;
      return liq > (acc.liquidity?.usd ?? 0) ? p : acc;
    }, pairs[0]);

    const vol24h = Object.values(best.volume).reduce((sum, v) => sum + v, 0);
    const txns24h = best.txns?.h24 ?? { buys: 0, sells: 0 };

    return {
      pairAddress: best.pairAddress,
      dexId: best.dexId,
      baseToken: { ...best.baseToken },
      priceUsd: best.priceUsd,
      priceNative: best.priceNative,
      liquidityUsd: best.liquidity?.usd ?? null,
      volume24h: vol24h,
      fdv: best.fdv,
      marketCap: best.marketCap,
      priceChange24h: best.priceChange?.h24 ?? null,
      txns24h,
    };
  }
}
