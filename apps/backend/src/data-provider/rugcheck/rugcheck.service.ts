import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/core/data-provider.port';
import type { RugCheckConfig } from './rugcheck.config';
import { RUGCHECK_CONFIG } from './rugcheck.config';
import type { RugCheckSummary } from './rugcheck.types';

const DEFAULT_BASE_URL = 'https://api.rugcheck.xyz/v1';

/**
 * RugCheck.xyz token safety provider — Solana only.
 *
 * Free API, no API key required. Provides locked liquidity % and
 * burned % for Solana tokens.
 */
@Injectable()
export class RugCheckService extends DataProviderPort {
  public readonly name = 'rugcheck';
  protected readonly logger = new Logger(RugCheckService.name);

  private readonly baseUrl: string;

  public constructor(@Inject(RUGCHECK_CONFIG) config: RugCheckConfig) {
    super();
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * Fetch the RugCheck summary report for a Solana token address.
   * Returns null if the token has no report (404) or on transport errors.
   */
  public async getSummary(address: string): Promise<RugCheckSummary | null> {
    try {
      const { data } = await axios.get<RugCheckSummary>(
        `${this.baseUrl}/tokens/${address}/report/summary`,
        { timeout: 5_000 },
      );
      if (!data) return null;
      return data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      this.logger.debug(`RugCheck API failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Deterministic mock data for tokens without a RugCheck report.
   * Values are derived from the address hash so they're consistent
   * per token but vary between tokens.
   */
  public getMockData(address: string): {
    lockedLiquidityPercent: number;
    burnedPercent: number;
  } {
    const hash = this.hashCode(address);
    return {
      lockedLiquidityPercent: 50 + (hash % 50),
      burnedPercent: hash % 30,
    };
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
