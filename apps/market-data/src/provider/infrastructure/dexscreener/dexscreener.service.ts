import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { throwIfRetryableProviderError } from '../../domain/retryable-provider.error';
import { DataProviderPort } from '../../domain/data-provider.port';
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
 * Our chain id -> DexScreener `token-pairs/v1` slug (chain-honest
 * snapshots, plan todo 18).
 *
 * Verified live 2026-10-04 against
 * `GET /token-pairs/v1/<slug>/0xFf81…8583d6`: every mapped slug
 * answers 200 with a JSON array (14 pairs for `base`, `[]` for the
 * rest — honest empties, never cross-chain). Robinhood verified live
 * 2026-10-06: `GET /token-pairs/v1/robinhood/0x968B…5583` answers 200
 * with the `uniswap` v4 NYMA/ETH pair (liq ~$6K) — todo 24. Any chain
 * WITHOUT an entry here resolves `null` WITHOUT touching the network
 * — never a silent cross-chain fallback (e.g. `unichain`, future
 * chains). Slugs are DexScreener's, not ours (`bsc`, not `bnb`).
 */
export const DEXSCREENER_CHAIN_SLUGS: Readonly<Record<string, string>> = {
  ethereum: 'ethereum',
  solana: 'solana',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
  robinhood: 'robinhood',
};

/**
 * Resolve our chain id to its DexScreener slug, or `null` when the
 * chain has no mapping (honest null — the caller must NOT fall back
 * to a cross-chain query).
 */
export function resolveDexScreenerSlug(chain: string): string | null {
  return DEXSCREENER_CHAIN_SLUGS[chain] ?? null;
}

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
   * Get token pairs for a specific chain (chain-honest path).
   *
   * Live shape (verified 2026-10-04): the endpoint answers a bare
   * JSON array of pairs (`[]` when the chain has none) — NOT the
   * `{ pairs }` envelope of the `/latest/dex/*` family. Both shapes
   * are accepted; anything else resolves `null`.
   */
  public async getPairsByChain(
    chainId: string,
    tokenAddress: string,
  ): Promise<ReadonlyArray<DexScreenerPair> | null> {
    try {
      const { data } = await axios.get<unknown>(
        `${BASE}/token-pairs/v1/${chainId}/${tokenAddress}`,
        {
          timeout: 8_000,
        },
      );
      if (Array.isArray(data)) {
        return data as ReadonlyArray<DexScreenerPair>;
      }
      if (data !== null && typeof data === 'object' && 'pairs' in data) {
        const pairs = (data as DexScreenerPairsResponse).pairs;
        return pairs ?? null;
      }
      return null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      // 19b2: timeout / 429-with-Retry-After / 5xx surface as a typed
      // error for the per-fetcher single retry (fetcher path only —
      // sibling methods keep the legacy null collapse).
      throwIfRetryableProviderError(err, 'dexscreener');
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
   *
   * TWO MODES (plan todo 18 — do not merge them):
   * - THIS method = best-effort cross-chain. Kept byte-identical for
   *   bare/unknown-chain callers (existing specs pin it).
   * - `getBestPairSummaryForChain` = strict per-chain. Explicit-chain
   *   snapshot paths MUST use it; a chain with no pair resolves
   *   `null`, never a sibling chain's data.
   *
   * @deprecated Cross-chain + side-unverified (plan todo 20): the
   *   summary now carries BOTH sides (`baseToken` + `quoteToken`) but
   *   this method performs no side check — callers that report
   *   `symbol`/`name` MUST resolve identity from the side matching
   *   their mint (see the dexscreener quote fetcher) or use
   *   `getBestPairSummaryForChain`. Kept working because gateway
   *   specs mock it; do not add new callers.
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

    return toPairSummary(best);
  }

  /**
   * Get the best-liquidity pair summary for a token ON ONE CHAIN
   * (strict mode, plan todo 18).
   *
   * `chain` is OUR chain id (`base`, NOT a DexScreener slug — the
   * slug resolves via `resolveDexScreenerSlug`). Unmapped chain ->
   * `null` with zero network traffic, never a cross-chain query.
   * The returned pairs pass a STRICT `chainId === slug` filter before
   * the best-liquidity pick (belt + suspenders on top of the already
   * chain-scoped endpoint), so a stray cross-chain row can never leak
   * into another chain's snapshot. Chain with no pair -> `null`
   * (honest empty; the snapshot's null-safe paths cover the rest).
   */
  public async getBestPairSummaryForChain(
    chain: string,
    address: string,
  ): Promise<DexScreenerPairSummary | null> {
    const slug = resolveDexScreenerSlug(chain);
    if (slug === null) return null;
    const pairs = await this.getPairsByChain(slug, address);
    if (!pairs || pairs.length === 0) return null;
    const scoped = pairs.filter((pair) => pair.chainId === slug);
    if (scoped.length === 0) return null;

    const best = scoped.reduce((acc, p) => {
      const liq = p.liquidity?.usd ?? 0;
      return liq > (acc.liquidity?.usd ?? 0) ? p : acc;
    }, scoped[0]);

    return toPairSummary(best);
  }
}

function toPairSummary(pair: DexScreenerPair): DexScreenerPairSummary {
  const vol24h = Object.values(pair.volume).reduce((sum, v) => sum + v, 0);
  const txns24h = pair.txns?.h24 ?? { buys: 0, sells: 0 };

  return {
    pairAddress: pair.pairAddress,
    dexId: pair.dexId,
    labels: [...(pair.labels ?? [])],
    baseToken: { ...pair.baseToken },
    quoteToken: {
      address: pair.quoteToken?.address ?? null,
      name: pair.quoteToken?.name ?? null,
      symbol: pair.quoteToken?.symbol ?? null,
    },
    priceUsd: pair.priceUsd,
    priceNative: pair.priceNative,
    liquidityUsd: pair.liquidity?.usd ?? null,
    volume24h: vol24h,
    fdv: pair.fdv,
    marketCap: pair.marketCap,
    priceChange24h: pair.priceChange?.h24 ?? null,
    txns24h,
  };
}
