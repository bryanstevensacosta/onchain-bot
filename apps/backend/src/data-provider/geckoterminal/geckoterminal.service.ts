import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/core/data-provider.port';
import type { GeckoTerminalConfig } from './geckoterminal.config';
import { GECKOTERMINAL_CONFIG } from './geckoterminal.config';
import type {
  GeckoTerminalResponse,
  GeckoTerminalTokenInfo,
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
