import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { throwIfRetryableProviderError } from '../../domain/retryable-provider.error';
import { DataProviderPort } from '../../domain/data-provider.port';
import type { DefiLlamaConfig } from './defillama.config';
import { DEFILLAMA_CONFIG } from './defillama.config';
import type {
  DefiLlamaChartMax,
  DefiLlamaChartPoint,
  DefiLlamaChartResponse,
  DefiLlamaCoinPrice,
  DefiLlamaPricesResponse,
} from './defillama.types';

const DEFAULT_BASE_URL = 'https://coins.llama.fi';

/**
 * Our chain id -> DeFiLlama Coins `{chain}:` slug (dexter plan todo 32).
 *
 * Coverage-probe verdicts, keyless, 2026-10-09 (evidence
 * `.omo/evidence/task-fe-newprov.log`, single batch `GET
 * /prices/current/{9 coins}`, 0.63-0.79s):
 * - INCLUDE: ethereum (WETH hit), solana (wSOL hit), bsc (WBNB hit),
 *   base (WETH hit), arbitrum (USDC hit — WETH/ARB miss = per-token
 *   variance, not chain), polygon (bridged-USDC hit), optimism (WETH
 *   hit), unichain (WETH hit).
 * - EXCLUDE: `robinhood` — no entry for WETH-predeploy NOR STAGEVEIL
 *   (never invent coverage; re-probe if Llama lists the chain).
 * Per-token variance is real (ARB/POL/WMATIC miss while siblings hit),
 * so this leg is price-only FALLBACK, never primary.
 */
export const DEFILLAMA_CHAIN_SLUGS: Readonly<Record<string, string>> = {
  ethereum: 'ethereum',
  solana: 'solana',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
  optimism: 'optimism',
  unichain: 'unichain',
};

/**
 * Our chains whose snapshots may consult DeFiLlama (dexter plan todo 32):
 * the slug-map entries that also exist in `STATIC_CHAINS`.
 * `optimism` + `unichain` stay mapped-but-unqueried until the catalog
 * lands (birdeye/gecko precedent — snapshots 404 before any fetcher
 * runs there, so querying would be dead quota).
 */
export const DEFILLAMA_SUPPORTED_CHAINS: ReadonlyArray<string> = [
  'ethereum',
  'solana',
  'bsc',
  'base',
  'arbitrum',
  'polygon',
];

/**
 * Resolve our chain id to its `coins.llama.fi` `{chain}:{address}`
 * coin id, or `null` when the chain has no proven coverage (honest
 * null — the caller must NOT fall back to another chain's slug).
 */
export function resolveDefiLlamaCoin(
  chain: string,
  address: string,
): string | null {
  const slug = DEFILLAMA_CHAIN_SLUGS[chain];
  if (slug === undefined || address.trim().length === 0) {
    return null;
  }
  return `${slug}:${address}`;
}

/** Minimum oracle confidence to accept a price (probes: 0.99 always). */
export const DEFILLAMA_MIN_CONFIDENCE = 0.5;

function isChartPointArray(
  value: unknown,
): value is ReadonlyArray<DefiLlamaChartPoint> {
  return Array.isArray(value);
}

/**
 * DeFiLlama Coins provider — keyless price leg (dexter plan todo 32).
 *
 * Host is `coins.llama.fi` (NOT `api.llama.fi` — that serves TVL).
 * `GET /prices/current/{coins}` carries price + decimals + timestamp +
 * confidence ONLY — no mcap/fdv/liquidity, so the fetcher maps
 * price (+mint-bound symbol) and nothing else.
 *
 * No API key exists for this surface (free, no published hard quota —
 * our outbound bucket pins 60/min by repo convention; probes spaced
 * 4s+ stayed 200 throughout).
 *
 * @see https://defillama.com/docs/api
 */
@Injectable()
export class DefiLlamaService extends DataProviderPort {
  public readonly name = 'defillama';
  protected readonly logger = new Logger(DefiLlamaService.name);

  private readonly baseUrl: string;

  public constructor(@Inject(DEFILLAMA_CONFIG) config: DefiLlamaConfig) {
    super();
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * Current price for one coin. Returns null on miss (unknown coin),
   * 404, sub-confidence price, or transport errors.
   */
  public async getPrice(
    chain: string,
    address: string,
  ): Promise<DefiLlamaCoinPrice | null> {
    const coin = resolveDefiLlamaCoin(chain, address);
    if (coin === null) {
      return null;
    }
    try {
      const { data } = await axios.get<DefiLlamaPricesResponse>(
        `${this.baseUrl}/prices/current/${coin}`,
        { timeout: 8_000 },
      );
      const entry = data?.coins?.[coin];
      if (
        entry === null ||
        entry === undefined ||
        typeof entry.price !== 'number' ||
        !Number.isFinite(entry.price)
      ) {
        return null;
      }
      if (
        typeof entry.confidence === 'number' &&
        entry.confidence < DEFILLAMA_MIN_CONFIDENCE
      ) {
        return null;
      }
      return entry;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      // 19b2: transient (timeout / 429-with-Retry-After / 5xx) surfaces
      // for the per-fetcher single retry; absence stays null.
      throwIfRetryableProviderError(err, 'defillama');
      this.logger.debug(`DeFiLlama price failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Client-side max over the `/chart/{coin}` series (dexter plan
   * todo 32 — ATH-ish, deliberately WEAKER than Mobula `token-ath`:
   * the probed series is coarse (1 point over 90d for WETH), so this
   * max is a window artifact, NOT an all-time high. The snapshot
   * fetcher NEVER calls this (ATH stays own-history per the
   * ATH-history rule); exposed for future explicit consumers only.
   */
  public async getChartMax(
    chain: string,
    address: string,
    startUnix?: number,
  ): Promise<DefiLlamaChartMax | null> {
    const coin = resolveDefiLlamaCoin(chain, address);
    if (coin === null) {
      return null;
    }
    try {
      const { data } = await axios.get<DefiLlamaChartResponse>(
        `${this.baseUrl}/chart/${coin}`,
        {
          params: startUnix === undefined ? {} : { start: startUnix },
          timeout: 8_000,
        },
      );
      const entry = data?.coins?.[coin];
      const points = entry?.prices;
      if (!isChartPointArray(points) || points.length === 0) {
        return null;
      }
      let best = points[0];
      for (const point of points) {
        if (
          typeof point?.price === 'number' &&
          Number.isFinite(point.price) &&
          point.price > best.price
        ) {
          best = point;
        }
      }
      if (!Number.isFinite(best.price)) {
        return null;
      }
      return {
        maxPrice: best.price,
        at: new Date(best.timestamp * 1_000).toISOString(),
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      throwIfRetryableProviderError(err, 'defillama');
      this.logger.debug(`DeFiLlama chart failed: ${(err as Error).message}`);
      return null;
    }
  }
}
