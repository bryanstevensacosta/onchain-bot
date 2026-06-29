import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/core/data-provider.port';
import type { MoralisConfig } from './moralis.config';
import { MORALIS_CONFIG } from './moralis.config';
import type {
  MoralisAnalyticsResponse,
  MoralisHoldersResponse,
  MoralisMetadataResponse,
  MoralisTokenPriceResponse,
  MoralisTokenAnalytics,
  MoralisTokenHolderSummary,
  MoralisWalletBalancesResponse,
} from './moralis.types';

const BASE = 'https://deep-index.moralis.io/api/v2.2';

/**
 * Moralis market data provider — EVM only.
 *
 * Three parallel calls per token fetch: analytics, holders, metadata.
 * Also exposes wallet balances and token price lookups.
 *
 * @see https://docs.moralis.io/
 */
@Injectable()
export class MoralisService extends DataProviderPort {
  public readonly name = 'moralis';
  protected readonly logger = new Logger(MoralisService.name);

  private readonly apiKey: string;

  /** Maps normalized chain names to Moralis API slugs. */
  private static readonly CHAIN_MAP: Record<string, string> = {
    ethereum: 'eth',
    bsc: 'bsc',
    base: 'base',
    arbitrum: 'arbitrum',
    polygon: 'polygon',
  };

  public constructor(@Inject(MORALIS_CONFIG) config: MoralisConfig) {
    super();
    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      this.logger.warn(
        'MORALIS_API_KEY missing — Moralis provider will return null',
      );
    }
  }

  public async onModuleInit(): Promise<void> {
    if (this.apiKey) {
      this.logger.log('Moralis provider initialized');
    }
  }

  // ─────────────────────────────────────────────
  //  Token analytics & pricing
  // ─────────────────────────────────────────────

  /**
   * Token analytics — price, liquidity, FDV, 24h price change.
   *
   * @param address - Token contract address
   * @param chain - Chain name (ethereum, bsc, base, arbitrum, polygon)
   */
  public async getTokenAnalytics(
    address: string,
    chain: string,
  ): Promise<MoralisTokenAnalytics | null> {
    const slug = MoralisService.CHAIN_MAP[chain];
    if (!slug || !this.apiKey) return null;
    try {
      const { data } = await axios.get<MoralisAnalyticsResponse>(
        `${BASE}/tokens/${address}/analytics`,
        {
          params: { chain: slug },
          headers: { 'X-API-Key': this.apiKey },
          timeout: 8_000,
        },
      );
      return {
        priceUsd: data.usdPrice ? parseFloat(data.usdPrice) : null,
        liquidityUsd: data.totalLiquidityUsd
          ? parseFloat(data.totalLiquidityUsd)
          : null,
        fdvUsd: data.totalFullyDilutedValuation
          ? parseFloat(data.totalFullyDilutedValuation)
          : null,
        priceChange24h: data.pricePercentChange?.['24h'] ?? null,
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Moralis /analytics failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Holders & supply distribution
  // ─────────────────────────────────────────────

  /**
   * Token holders — total count and top 10 supply percentage.
   *
   * @param address - Token contract address
   * @param chain - Chain name (ethereum, bsc, base, arbitrum, polygon)
   */
  public async getTokenHolders(
    address: string,
    chain: string,
  ): Promise<MoralisTokenHolderSummary | null> {
    const slug = MoralisService.CHAIN_MAP[chain];
    if (!slug || !this.apiKey) return null;
    try {
      const { data } = await axios.get<MoralisHoldersResponse>(
        `${BASE}/erc20/${address}/holders`,
        {
          params: { chain: slug },
          headers: { 'X-API-Key': this.apiKey },
          timeout: 8_000,
        },
      );
      const rawTop10 = data.holderSupply?.top10?.supplyPercent;
      const top10 =
        typeof rawTop10 === 'string'
          ? parseFloat(rawTop10)
          : (rawTop10 ?? null);
      const rawHolders = data.totalHolders;
      const holders =
        typeof rawHolders === 'string'
          ? parseInt(rawHolders, 10)
          : (rawHolders ?? null);
      return { holders, top10HolderPercent: top10 };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Moralis /holders failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Metadata & price
  // ─────────────────────────────────────────────

  /**
   * Token metadata — logo URL.
   *
   * @param address - Token contract address
   * @param chain - Chain name (ethereum, bsc, base, arbitrum, polygon)
   */
  public async getTokenMetadata(
    address: string,
    chain: string,
  ): Promise<MoralisMetadataResponse | null> {
    const slug = MoralisService.CHAIN_MAP[chain];
    if (!slug || !this.apiKey) return null;
    try {
      const { data } = await axios.get<MoralisMetadataResponse[]>(
        `${BASE}/erc20/metadata`,
        {
          params: { chain: slug, addresses: address },
          headers: { 'X-API-Key': this.apiKey },
          timeout: 8_000,
        },
      );
      return Array.isArray(data) ? (data[0] ?? null) : null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Moralis /metadata failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Token price — lightweight lookup with formatted USD value.
   *
   * @param address - Token contract address
   * @param chain - Chain name (ethereum, bsc, base, arbitrum, polygon)
   */
  public async getTokenPrice(
    address: string,
    chain: string,
  ): Promise<MoralisTokenPriceResponse | null> {
    const slug = MoralisService.CHAIN_MAP[chain];
    if (!slug || !this.apiKey) return null;
    try {
      const { data } = await axios.get<MoralisTokenPriceResponse>(
        `${BASE}/erc20/${address}/price`,
        {
          params: { chain: slug },
          headers: { 'X-API-Key': this.apiKey },
          timeout: 8_000,
        },
      );
      return data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Moralis /price failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Wallet data
  // ─────────────────────────────────────────────

  /**
   * Wallet token balances — all ERC-20 tokens with USD values.
   *
   * @param wallet - Wallet address
   * @param chain - Chain name (ethereum, bsc, base, arbitrum, polygon)
   */
  public async getWalletBalances(
    wallet: string,
    chain: string,
  ): Promise<MoralisWalletBalancesResponse['result'] | null> {
    const slug = MoralisService.CHAIN_MAP[chain];
    if (!slug || !this.apiKey) return null;
    try {
      const { data } = await axios.get<MoralisWalletBalancesResponse>(
        `${BASE}/wallets/${wallet}/tokens`,
        {
          params: { chain: slug },
          headers: { 'X-API-Key': this.apiKey },
          timeout: 8_000,
        },
      );
      return data.result ?? null;
    } catch (err) {
      this.logger.debug(`Moralis /balances failed: ${(err as Error).message}`);
      return null;
    }
  }
}
