import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from '../../domain/data-provider.port';
import type { GeckoTerminalConfig } from './geckoterminal.config';
import { GECKOTERMINAL_CONFIG } from './geckoterminal.config';
import type {
  GeckoTerminalPoolResource,
  GeckoTerminalResponse,
  GeckoTerminalTokenInfo,
  GeckoPoolQuote,
} from './geckoterminal.types';

const BASE = 'https://api.geckoterminal.com/api/v2';

/**
 * GeckoTerminal market data provider — free, no API key required.
 *
 * Provides token info across 100+ chains: holders, price, FDV, market cap,
 * volume, price change, GT score. Data aggregated from multiple DEXes.
 *
 * Free tier — rate limited but no hard cap documented.
 *
 * @see https://www.geckoterminal.com/dex-api
 */
@Injectable()
export class GeckoTerminalService extends DataProviderPort {
  public readonly name = 'geckoterminal';
  protected readonly logger = new Logger(GeckoTerminalService.name);

  public constructor(
    @Inject(GECKOTERMINAL_CONFIG) _config: GeckoTerminalConfig,
  ) {
    super();
    this.logger.log(
      'GeckoTerminal provider initialized (free, no API key required)',
    );
  }

  public async onModuleInit(): Promise<void> {
    this.logger.log('GeckoTerminal provider ready');
  }

  // ─────────────────────────────────────────────
  //  Token info
  // ─────────────────────────────────────────────

  /**
   * Get token info by network slug and contract address.
   *
   * @param networkSlug - Network identifier (e.g. 'solana', 'ethereum', 'bsc')
   * @param address     - Token contract address
   */
  public async getTokenInfo(
    networkSlug: string,
    address: string,
  ): Promise<GeckoTerminalTokenInfo | null> {
    try {
      const { data } = await axios.get<GeckoTerminalResponse>(
        `${BASE}/networks/${networkSlug}/tokens/${address}/info`,
        { timeout: 8_000 },
      );
      return this.toTokenInfo(data.data.attributes);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `GeckoTerminal getTokenInfo failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Token pools (pool-by-address resolution)
  // ─────────────────────────────────────────────

  public async getTokenPools(
    networkSlug: string,
    address: string,
  ): Promise<ReadonlyArray<GeckoTerminalPoolResource> | null> {
    try {
      const { data } = await axios.get<{
        readonly data: ReadonlyArray<GeckoTerminalPoolResource>;
      }>(`${BASE}/networks/${networkSlug}/tokens/${address}/pools`, {
        timeout: 8_000,
      });
      return Array.isArray(data.data) ? data.data : null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `GeckoTerminal getTokenPools failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Mapping helpers
  // ─────────────────────────────────────────────

  private toTokenInfo(
    attrs: GeckoTerminalResponse['data']['attributes'],
  ): GeckoTerminalTokenInfo {
    return {
      address: attrs.address,
      name: attrs.name || null,
      symbol: attrs.symbol || null,
      totalSupply: attrs.total_supply ?? null,
      decimals: attrs.decimals ?? null,
      holders: attrs.holders?.count ?? null,
      top10HolderPercent: attrs.top_10_percent_holders
        ? parseFloat(attrs.top_10_percent_holders)
        : null,
      gtScore: attrs.gt_score ?? null,
      priceUsd: attrs.price_usd ? parseFloat(attrs.price_usd) : null,
      fdvUsd: attrs.fdv_usd ? parseFloat(attrs.fdv_usd) : null,
      marketCapUsd: attrs.market_cap_usd
        ? parseFloat(attrs.market_cap_usd)
        : null,
      volumeUsdH24: attrs.volume_usd?.h24
        ? parseFloat(attrs.volume_usd.h24)
        : null,
      priceChangePercentH24: attrs.price_change_percentage?.h24
        ? parseFloat(attrs.price_change_percentage.h24)
        : null,
    };
  }
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function poolSideAddress(
  ref: { readonly data?: { readonly id?: string } | null } | null | undefined,
): string | null {
  const id = ref?.data?.id;
  if (typeof id !== 'string' || id.length === 0) return null;
  return id.split('_').pop()?.toLowerCase() ?? null;
}

export function selectPoolQuote(
  pools: ReadonlyArray<GeckoTerminalPoolResource> | null | undefined,
  address: string,
): GeckoPoolQuote | null {
  if (
    !Array.isArray(pools) ||
    typeof address !== 'string' ||
    address.length === 0
  ) {
    return null;
  }
  const list: ReadonlyArray<GeckoTerminalPoolResource> = pools;
  const wanted = address.toLowerCase();
  let best: GeckoTerminalPoolResource | null = null;
  let bestSide: 'base' | 'quote' | null = null;
  let bestReserve = Number.NEGATIVE_INFINITY;
  for (const pool of list) {
    if (pool === null || typeof pool !== 'object') continue;
    const baseAddr = poolSideAddress(pool.relationships?.base_token);
    const quoteAddr = poolSideAddress(pool.relationships?.quote_token);
    const side =
      baseAddr === wanted ? 'base' : quoteAddr === wanted ? 'quote' : null;
    if (side === null) continue;
    const reserve =
      toFiniteNumber(pool.attributes?.reserve_in_usd) ??
      Number.NEGATIVE_INFINITY;
    if (best === null || reserve > bestReserve) {
      best = pool;
      bestSide = side;
      bestReserve = reserve;
    }
  }
  if (best === null || bestSide === null) return null;
  const priceRaw =
    bestSide === 'base'
      ? best.attributes?.base_token_price_usd
      : best.attributes?.quote_token_price_usd;
  const dexIdRaw = best.relationships?.dex?.data?.id;
  return {
    fdvUsd:
      bestSide === 'base' ? toFiniteNumber(best.attributes?.fdv_usd) : null,
    priceUsd: toFiniteNumber(priceRaw),
    dexId:
      typeof dexIdRaw === 'string' && dexIdRaw.trim() !== ''
        ? dexIdRaw.trim()
        : null,
  };
}
