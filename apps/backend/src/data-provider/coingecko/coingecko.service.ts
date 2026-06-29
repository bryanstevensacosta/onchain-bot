import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/core/data-provider.port';
import type { CoinGeckoConfig } from './coingecko.config';
import { COINGECKO_CONFIG } from './coingecko.config';
import type { CoinGeckoResponse, CoinGeckoTokenInfo } from './coingecko.types';

const BASE = 'https://api.coingecko.com/api/v3';

/**
 * CoinGecko market data provider — fallback price/MC/FDV provider.
 *
 * Requires COINGECKO_API_KEY (Demo plan — ~30 req/min, 10k credits/month).
 * Best for established tokens (blue chips) where DexScreener / GeckoTerminal
 * may lack data.
 *
 * Does NOT return liquidityUsd or holders — price-only fallback.
 *
 * @see https://www.coingecko.com/en/api
 */
@Injectable()
export class CoinGeckoService extends DataProviderPort {
  public readonly name = 'coingecko';
  protected readonly logger = new Logger(CoinGeckoService.name);

  private readonly apiKey: string;

  public constructor(@Inject(COINGECKO_CONFIG) config: CoinGeckoConfig) {
    super();
    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      this.logger.warn(
        'COINGECKO_API_KEY missing — CoinGecko provider will return null',
      );
    }
  }

  public async onModuleInit(): Promise<void> {
    if (this.apiKey) {
      this.logger.log('CoinGecko provider initialized');
    }
  }

  // ─────────────────────────────────────────────
  //  Token contract info
  // ─────────────────────────────────────────────

  /**
   * Get token info by platform (chain) and contract address.
   *
   * @param platform - CoinGecko platform ID (e.g. 'ethereum', 'solana')
   * @param address  - Token contract address
   */
  public async getTokenContractInfo(
    platform: string,
    address: string,
  ): Promise<CoinGeckoTokenInfo | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<CoinGeckoResponse>(
        `${BASE}/coins/${platform}/contract/${address}`,
        {
          headers: { 'x-cg-demo-api-key': this.apiKey },
          timeout: 8_000,
        },
      );
      const md = data.market_data;
      if (!md) return null;
      const priceUsd = md.current_price?.usd ?? null;
      const marketCapUsd = md.market_cap?.usd ?? null;
      if (priceUsd === null && marketCapUsd === null) return null;
      return {
        priceUsd,
        marketCapUsd,
        fdvUsd: md.fully_diluted_valuation?.usd ?? null,
        volumeUsdH24: md.total_volume?.usd ?? null,
        priceChangePercent24h: md.price_change_percentage_24h ?? null,
        imageUrls: this.extractImageUrls(data.image),
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `CoinGecko getTokenContractInfo failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────

  private extractImageUrls(
    image: CoinGeckoResponse['image'],
  ): ReadonlyArray<string> {
    if (!image) return [];
    const candidates = [image.large, image.small, image.thumb];
    return Array.from(
      new Set(
        candidates.filter(
          (url): url is string =>
            typeof url === 'string' &&
            url.length > 0 &&
            /^https?:\/\//.test(url),
        ),
      ),
    );
  }
}
