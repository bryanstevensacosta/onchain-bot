import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/core/data-provider.port';
import type { CoinMarketCapConfig } from './coinmarketcap.config';
import { COINMARKETCAP_CONFIG } from './coinmarketcap.config';
import type {
  CmcQuotesLatestResponse,
  CmcInfoResponse,
  CmcListingsResponse,
  CmcMapResponse,
  CmcPriceConversionResponse,
  CmcGlobalMetricsResponse,
} from './coinmarketcap.types';

const BASE = 'https://pro-api.coinmarketcap.com/v1';
const HEADER_KEY = 'X-CMC_PRO_API_KEY';

/**
 * CoinMarketCap market data provider.
 *
 * Provides crypto market data: real-time quotes, metadata, listings,
 * price conversion, and global metrics.
 *
 * @see https://coinmarketcap.com/api/documentation/v1/
 */
@Injectable()
export class CoinMarketCapService extends DataProviderPort {
  public readonly name = 'coinmarketcap';
  protected readonly logger = new Logger(CoinMarketCapService.name);

  private readonly apiKey: string;

  public constructor(
    @Inject(COINMARKETCAP_CONFIG) config: CoinMarketCapConfig,
  ) {
    super();
    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      this.logger.warn(
        'COINMARKETCAP_API_KEY missing — CoinMarketCap provider will return null',
      );
    }
  }

  public async onModuleInit(): Promise<void> {
    if (this.apiKey) {
      this.logger.log('CoinMarketCap provider initialized');
    }
  }

  // ─────────────────────────────────────────────
  //  Quotes & market data
  // ─────────────────────────────────────────────

  /**
   * Latest quotes for one or more cryptocurrencies.
   *
   * @param symbol - Single symbol or array of symbols (e.g. 'BTC' or ['BTC','ETH'])
   * @param convert - Fiat to convert to (default: USD)
   */
  public async getQuotesLatest(
    symbol: string | readonly string[],
    convert: string = 'USD',
  ): Promise<CmcQuotesLatestResponse['data'] | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<{
        data: CmcQuotesLatestResponse['data'];
        status: { error_code: number };
      }>(`${BASE}/cryptocurrency/quotes/latest`, {
        params: {
          symbol: Array.isArray(symbol) ? symbol.join(',') : symbol,
          convert,
        },
        headers: { [HEADER_KEY]: this.apiKey },
        timeout: 8_000,
      });
      if (data.status?.error_code && data.status.error_code !== 0) {
        this.logger.debug(
          `CoinMarketCap API error: error_code=${data.status.error_code}`,
        );
        return null;
      }
      return data.data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `CoinMarketCap /quotes/latest failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Metadata & listings
  // ─────────────────────────────────────────────

  /**
   * Static metadata for one or more cryptocurrencies.
   *
   * @param symbol - Single symbol or array of symbols
   */
  public async getInfo(
    symbol: string | readonly string[],
  ): Promise<CmcInfoResponse['data'] | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<{
        data: CmcInfoResponse['data'];
        status: { error_code: number };
      }>(`${BASE}/cryptocurrency/info`, {
        params: { symbol: Array.isArray(symbol) ? symbol.join(',') : symbol },
        headers: { [HEADER_KEY]: this.apiKey },
        timeout: 8_000,
      });
      if (data.status?.error_code && data.status.error_code !== 0) return null;
      return data.data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `CoinMarketCap /info failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Paginated list of active cryptocurrencies ranked by market cap.
   *
   * @param limit  - Items per page (default: 100)
   * @param convert - Fiat conversion (default: USD)
   */
  public async getListingsLatest(
    limit: number = 100,
    convert: string = 'USD',
  ): Promise<CmcListingsResponse['data'] | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<{
        data: CmcListingsResponse['data'];
        status: { error_code: number };
      }>(`${BASE}/cryptocurrency/listings/latest`, {
        params: { start: 1, limit, convert },
        headers: { [HEADER_KEY]: this.apiKey },
        timeout: 8_000,
      });
      if (data.status?.error_code && data.status.error_code !== 0) return null;
      return data.data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `CoinMarketCap /listings/latest failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Map of cryptocurrencies to CoinMarketCap IDs.
   */
  public async getMap(): Promise<CmcMapResponse['data'] | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<{
        data: CmcMapResponse['data'];
        status: { error_code: number };
      }>(`${BASE}/cryptocurrency/map`, {
        params: { listing_status: 'active' },
        headers: { [HEADER_KEY]: this.apiKey },
        timeout: 8_000,
      });
      if (data.status?.error_code && data.status.error_code !== 0) return null;
      return data.data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`CoinMarketCap /map failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Tools & global metrics
  // ─────────────────────────────────────────────

  /**
   * Convert an amount between cryptocurrencies/fiat.
   *
   * @param amount  - Amount to convert
   * @param symbol  - Source cryptocurrency symbol
   * @param convert - Target fiat (default: USD)
   */
  public async priceConversion(
    amount: number,
    symbol: string,
    convert: string = 'USD',
  ): Promise<CmcPriceConversionResponse['data'] | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<{
        data: CmcPriceConversionResponse['data'];
        status: { error_code: number };
      }>(`${BASE}/tools/price-conversion`, {
        params: { amount, symbol, convert },
        headers: { [HEADER_KEY]: this.apiKey },
        timeout: 8_000,
      });
      if (data.status?.error_code && data.status.error_code !== 0) return null;
      return data.data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `CoinMarketCap /price-conversion failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Aggregate global market metrics.
   *
   * @param convert - Fiat conversion (default: USD)
   */
  public async getGlobalMetrics(
    convert: string = 'USD',
  ): Promise<CmcGlobalMetricsResponse['data'] | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<{
        data: CmcGlobalMetricsResponse['data'];
        status: { error_code: number };
      }>(`${BASE}/global-metrics/quotes/latest`, {
        params: { convert },
        headers: { [HEADER_KEY]: this.apiKey },
        timeout: 8_000,
      });
      if (data.status?.error_code && data.status.error_code !== 0) return null;
      return data.data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `CoinMarketCap /global-metrics failed: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
