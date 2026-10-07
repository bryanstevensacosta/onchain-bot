import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { throwIfRetryableProviderError } from '../../domain/retryable-provider.error';
import { DataProviderPort } from '../../domain/data-provider.port';
import type { BirdeyeConfig } from './birdeye.config';
import { BIRDEYE_CONFIG } from './birdeye.config';
import type {
  BirdeyeResponse,
  BirdeyeTokenOverviewData,
  BirdeyePriceData,
  BirdeyeTradesData,
  BirdeyeHolderProfileData,
  BirdeyeHolderPositionsData,
} from './birdeye.types';

const BASE = 'https://public-api.birdeye.so';

/**
 * Birdeye market data provider — Solana focused.
 *
 * Public API (limited): price, overview, trades.
 * Premium API key required for full access.
 *
 * @see https://docs.birdeye.so/
 */
@Injectable()
export class BirdeyeService extends DataProviderPort {
  public readonly name = 'birdeye';
  protected readonly logger = new Logger(BirdeyeService.name);

  private readonly apiKey: string;

  public constructor(@Inject(BIRDEYE_CONFIG) config: BirdeyeConfig) {
    super();
    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      this.logger.warn(
        'BIRDEYE_API_KEY missing — Birdeye provider will return null',
      );
    }
  }

  public async onModuleInit(): Promise<void> {
    if (this.apiKey) {
      this.logger.log('Birdeye provider initialized');
    }
  }

  // ─────────────────────────────────────────────
  //  Token data
  // ─────────────────────────────────────────────

  /**
   * Current token overview — price, volume, liquidity, market cap, holders.
   *
   * @param address - Token contract address
   * @param chain   - Chain slug (default: solana)
   */
  public async getTokenOverview(
    address: string,
    chain: string = 'solana',
  ): Promise<BirdeyeTokenOverviewData | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<
        BirdeyeResponse<BirdeyeTokenOverviewData>
      >(`${BASE}/defi/token_overview`, {
        params: { address },
        headers: { 'X-API-KEY': this.apiKey, 'x-chain': chain },
        timeout: 8_000,
      });
      if (!data.success || !data.data) return null;
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      // 19b2: transient (timeout / 429-with-Retry-After / 5xx) surfaces
      // for the per-fetcher single retry; absence stays null.
      throwIfRetryableProviderError(err, 'birdeye');
      this.logger.debug(
        `Birdeye /token_overview failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Current price for a token.
   *
   * @param address - Token contract address
   * @param chain   - Chain slug (default: solana)
   */
  public async getTokenPrice(
    address: string,
    chain: string = 'solana',
  ): Promise<BirdeyePriceData | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<BirdeyeResponse<BirdeyePriceData>>(
        `${BASE}/defi/price`,
        {
          params: { address },
          headers: { 'X-API-KEY': this.apiKey, 'x-chain': chain },
          timeout: 8_000,
        },
      );
      if (!data.success || !data.data) return null;
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Birdeye /price failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Recent trades/swaps for a token.
   *
   * @param address - Token contract address
   * @param chain   - Chain slug (default: solana)
   * @param limit   - Max trades to return (default: 50)
   */
  public async getTokenTrades(
    address: string,
    chain: string = 'solana',
    limit: number = 50,
  ): Promise<BirdeyeTradesData | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<BirdeyeResponse<BirdeyeTradesData>>(
        `${BASE}/defi/txs/token`,
        {
          params: {
            address,
            limit: String(limit),
            offset: '0',
            txType: 'swap',
            sortType: 'desc',
          },
          headers: { 'X-API-KEY': this.apiKey, 'x-chain': chain },
          timeout: 8_000,
        },
      );
      if (!data.success || !data.data) return null;
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Birdeye /txs/token failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Holder profile for a token — tag mix incl. dev (hold_amount,
   * percent_of_supply, PnL). No key -> null, never throws.
   */
  public async getHolderProfile(
    address: string,
    chain: string = 'solana',
  ): Promise<BirdeyeHolderProfileData | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<
        BirdeyeResponse<BirdeyeHolderProfileData>
      >(`${BASE}/token/v1/holder_profile`, {
        params: { address },
        headers: { 'X-API-KEY': this.apiKey, 'x-chain': chain },
        timeout: 8_000,
      });
      if (!data.success || !data.data) return null;
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `Birdeye /holder_profile failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Holder positions filtered by label (default dev wallets).
   * No key -> null, never throws.
   */
  public async getDevPositions(
    address: string,
    chain: string = 'solana',
    limit: number = 10,
  ): Promise<BirdeyeHolderPositionsData | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<
        BirdeyeResponse<BirdeyeHolderPositionsData>
      >(`${BASE}/token/v1/holder_positions`, {
        params: { address, labels: 'dev', limit: String(limit), offset: '0' },
        headers: { 'X-API-KEY': this.apiKey, 'x-chain': chain },
        timeout: 8_000,
      });
      if (!data.success || !data.data) return null;
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `Birdeye /holder_positions failed: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
