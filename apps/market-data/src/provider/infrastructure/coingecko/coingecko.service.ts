import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { throwIfRetryableProviderError } from '../../domain/retryable-provider.error';
import { DataProviderPort } from '../../domain/data-provider.port';
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
      const fdvUsd = md.fully_diluted_valuation?.usd ?? null;
      const volumeUsdH24 = md.total_volume?.usd ?? null;
      const priceChangePercent24h = md.price_change_percentage_24h ?? null;
      const totalSupply = md.total_supply ?? null;
      const circulatingSupply = md.circulating_supply ?? null;
      const maxSupply = md.max_supply ?? null;
      // Supply-transport rule (dexter plan todo 47): a supply-only row
      // is NOT "no data" — `total`/`circulating`/`max` feed the
      // computed-FDV seam (`total ?? max`) and the MC-coherence rule
      // (`price×circ`). The old `price+mcap null → null` gate discarded
      // already-fetched supply for long-tail tokens CoinGecko tracks
      // without pricing. Null-collapse only when EVERY mapped field is
      // null (aggregator contract unchanged: null still means `no data`).
      // Zero new calls: same single response, transported wider.
      if (
        priceUsd === null &&
        marketCapUsd === null &&
        fdvUsd === null &&
        volumeUsdH24 === null &&
        priceChangePercent24h === null &&
        totalSupply === null &&
        circulatingSupply === null &&
        maxSupply === null
      ) {
        return null;
      }
      return {
        priceUsd,
        marketCapUsd,
        fdvUsd,
        volumeUsdH24,
        priceChangePercent24h,
        totalSupply,
        circulatingSupply,
        maxSupply,
        imageUrls: this.extractImageUrls(data.image),
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      // 19b2: transient (timeout / 429-with-Retry-After / 5xx) surfaces
      // for the per-fetcher single retry; absence stays null.
      throwIfRetryableProviderError(err, 'coingecko');
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
