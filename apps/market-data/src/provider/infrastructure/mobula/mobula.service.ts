import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { throwIfRetryableProviderError } from '../../domain/retryable-provider.error';
import { DataProviderPort } from '../../domain/data-provider.port';
import type { MobulaConfig } from './mobula.config';
import { MOBULA_CONFIG } from './mobula.config';
import type {
  MobulaMarketResponse,
  MobulaMarketToken,
  MobulaWalletPortfolio,
  MobulaHistoryEntry,
  MobulaHistoryResponse,
  MobulaMetadataResponse,
  MobulaMetadata,
  MobulaTokenPriceResponse,
  MobulaTokenPriceData,
  MobulaTokenPriceBatchResponse,
  MobulaTokenPriceBatchItem,
  MobulaTokenPriceBatchEntry,
} from './mobula.types';

const BASE = 'https://api.mobula.io/api/2';

/**
 * Mobula v2 market data provider — multi-chain (EVM + Solana).
 *
 * Unique value: concentration metrics (top10, insiders, bundlers, dev),
 * bonding curve detection, and factory fingerprinting.
 *
 * @see https://docs.mobula.io/
 */
@Injectable()
export class MobulaService extends DataProviderPort {
  public readonly name = 'mobula';
  protected readonly logger = new Logger(MobulaService.name);

  private readonly apiKey: string;

  /**
   * Maps normalized chain names to Mobula API slugs.
   *
   * Gap note (dexter plan todo 31, honest): robinhood/unichain/
   * optimism have NO row — the demo endpoint 403s `token/price` on
   * the free plan, so chain support could not be live-proven without
   * spending the production key (never invent coverage). Add rows
   * only after a keyed `token/price` probe answers 200 for them.
   */
  private static readonly CHAIN_MAP: Record<string, string> = {
    ethereum: 'ethereum',
    bsc: 'bsc',
    base: 'base',
    arbitrum: 'arbitrum',
    polygon: 'polygon',
    solana: 'solana',
  };

  public constructor(@Inject(MOBULA_CONFIG) config: MobulaConfig) {
    super();
    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      this.logger.warn(
        'MOBULA_API_KEY missing — Mobula provider will return null',
      );
    }
  }

  public async onModuleInit(): Promise<void> {
    if (this.apiKey) {
      this.logger.log('Mobula provider initialized');
    }
  }

  // ─────────────────────────────────────────────
  //  Market data & concentration metrics
  // ─────────────────────────────────────────────

  /**
   * Market data + concentration metrics for a token.
   *
   * Returns price, liquidity, supply, and unique risk metrics:
   * top10/insiders/bundlers/dev holdings percentages, bonding curve %, factory.
   *
   * @param address - Token contract address
   * @param blockchain - Chain name (ethereum, bsc, base, arbitrum, polygon, solana)
   */
  public async getTokenMarkets(
    address: string,
    blockchain: string,
  ): Promise<MobulaMarketToken | null> {
    const slug = MobulaService.CHAIN_MAP[blockchain];
    if (!slug) return null;
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<MobulaMarketResponse>(
        `${BASE}/token/markets`,
        {
          params: { address, blockchain: slug },
          headers: { Authorization: this.apiKey },
          timeout: 8_000,
        },
      );
      return data.data?.[0]?.base ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      // 19b2: transient (timeout / 429-with-Retry-After / 5xx) surfaces
      // for the per-fetcher single retry; absence stays null.
      throwIfRetryableProviderError(err, 'mobula');
      this.logger.debug(
        `Mobula getTokenMarkets failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Cheap price legs (dexter plan todo 31)
  // ─────────────────────────────────────────────

  /**
   * Pool-based price + mcap + liquidity for a single token — the cheap
   * leg the quote fetcher falls back to when the heavy `token/markets`
   * view misses (keyed, demo rate-limited; the demo endpoint 403s this
   * path on the free plan, so keyed specs only, no live probes).
   *
   * Literal path is `/token/price` (the docs-page slug `token-price`
   * is NOT the path). `blockchain` accepts the `CHAIN_MAP` slug.
   * No key or unmapped chain -> null, never throws.
   *
   * @see https://docs.mobula.io/rest-api-reference/endpoint/token-price
   */
  public async getTokenPrice(
    address: string,
    blockchain: string,
  ): Promise<MobulaTokenPriceData | null> {
    const slug = MobulaService.CHAIN_MAP[blockchain];
    if (!slug) return null;
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<MobulaTokenPriceResponse>(
        `${BASE}/token/price`,
        {
          params: { address, blockchain: slug },
          headers: { Authorization: this.apiKey },
          timeout: 8_000,
        },
      );
      return data.data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      throwIfRetryableProviderError(err, 'mobula');
      this.logger.debug(
        `Mobula getTokenPrice failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Batch price leg, up to 500 tokens per request (dexter plan todo 31
   * — the batch-500 collapse for batch endpoints: one call replaces
   * N× single-token heavies). Positional response: match slots by the
   * echoed `address` (+ `chainId`), never by order; `error` slots are
   * skipped, never null-crashed. Entries past 500 are dropped
   * client-side (fail-open, never a 400 on oversize).
   *
   * Keyed; no key or empty input -> null/empty without network.
   *
   * @see https://docs.mobula.io/rest-api-reference/endpoint/token-price-post
   */
  public async getTokenPriceBatch(
    entries: ReadonlyArray<MobulaTokenPriceBatchEntry>,
  ): Promise<ReadonlyArray<MobulaTokenPriceBatchItem> | null> {
    if (!this.apiKey) return null;
    const items = entries
      .filter(
        (entry) =>
          typeof entry?.address === 'string' &&
          typeof entry?.blockchain === 'string' &&
          MobulaService.CHAIN_MAP[entry.blockchain] !== undefined,
      )
      .slice(0, 500)
      .map((entry) => ({
        address: entry.address,
        blockchain: MobulaService.CHAIN_MAP[entry.blockchain],
      }));
    if (items.length === 0) return null;
    try {
      const { data } = await axios.post<MobulaTokenPriceBatchResponse>(
        `${BASE}/token/price`,
        { items },
        {
          headers: { Authorization: this.apiKey },
          timeout: 8_000,
        },
      );
      if (!Array.isArray(data.payload)) return null;
      const slots = data.payload as ReadonlyArray<MobulaTokenPriceBatchItem>;
      return slots.filter(
        (slot) => slot != null && typeof slot === 'object' && !slot.error,
      );
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      throwIfRetryableProviderError(err, 'mobula');
      this.logger.debug(
        `Mobula getTokenPriceBatch failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Wallet & portfolio
  // ─────────────────────────────────────────────

  /**
   * Full wallet portfolio — all token balances with USD values.
   *
   * @param wallet - Wallet address
   */
  public async getWalletPortfolio(
    wallet: string,
  ): Promise<MobulaWalletPortfolio | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<MobulaWalletPortfolio>(
        `${BASE}/wallet/portfolio`,
        {
          params: { wallet },
          headers: { Authorization: this.apiKey },
          timeout: 8_000,
        },
      );
      return data ?? null;
    } catch (err) {
      this.logger.debug(
        `Mobula getWalletPortfolio failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Historical data & metadata
  // ─────────────────────────────────────────────

  /**
   * Historical price/volume data for a token over a time range.
   *
   * @param address - Token contract address
   * @param from - Start timestamp (Unix seconds, optional)
   * @param to - End timestamp (Unix seconds, optional)
   */
  public async getTokenHistory(
    address: string,
    from?: number,
    to?: number,
  ): Promise<ReadonlyArray<MobulaHistoryEntry> | null> {
    if (!this.apiKey) return null;
    const params: Record<string, string | number> = { address };
    if (from) params.from = from;
    if (to) params.to = to;
    try {
      const { data } = await axios.get<MobulaHistoryResponse>(
        `${BASE}/token/history`,
        { params, headers: { Authorization: this.apiKey }, timeout: 8_000 },
      );
      return data.data ?? null;
    } catch (err) {
      this.logger.debug(
        `Mobula getTokenHistory failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Token metadata (name, symbol, icon, decimals).
   *
   * @param address - Token contract address
   */
  public async getTokenMetadata(
    address: string,
  ): Promise<MobulaMetadata | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get<MobulaMetadataResponse>(
        `${BASE}/token/metadata`,
        {
          params: { address },
          headers: { Authorization: this.apiKey },
          timeout: 8_000,
        },
      );
      return data.data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `Mobula getTokenMetadata failed: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
