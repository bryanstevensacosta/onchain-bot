import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { throwIfRetryableProviderError } from '../../domain/retryable-provider.error';
import { DataProviderPort } from '../../domain/data-provider.port';
import type { RugCheckConfig } from './rugcheck.config';
import { RUGCHECK_CONFIG } from './rugcheck.config';
import type {
  RugCheckNewToken,
  RugCheckSearchRow,
  RugCheckSummary,
} from './rugcheck.types';

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
      // 19b2: transient (timeout / 429-with-Retry-After / 5xx) surfaces
      // for the per-fetcher single retry; absence stays null.
      throwIfRetryableProviderError(err, 'rugcheck');
      this.logger.debug(`RugCheck API failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Full-text search over name/symbol/mint, ranked legit-first
   * (dexter plan todo 31, keyless).
   *
   * Live shape (verified 2026-10-09): bare array of
   * `{ mint, name, symbol, verified, score, mcap, holders }`
   * (`GET /v1/search?query=PUMP` answers PUMP/PENGU/USD1/JUP rows).
   * Blank queries return null zero-network (upstream answers trending
   * on empty query — never spend snapshot quota on that).
   *
   * @see https://api.rugcheck.xyz/swagger/index.html
   */
  public async search(
    query: string,
  ): Promise<ReadonlyArray<RugCheckSearchRow> | null> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return null;
    try {
      const { data } = await axios.get<unknown>(`${this.baseUrl}/search`, {
        params: { query: trimmed },
        timeout: 5_000,
      });
      if (!Array.isArray(data)) return null;
      return data as ReadonlyArray<RugCheckSearchRow>;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      throwIfRetryableProviderError(err, 'rugcheck');
      this.logger.debug(`RugCheck search failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Recently-detected-tokens discovery feed (dexter plan todo 31,
   * keyless) — the pre-launch pre-warm input (the 2026-10-08
   * pump.fun-board-Cloudflare lesson makes keyless substitutes
   * critical). Feed, not per-address: the snapshot fetcher NEVER
   * calls this per snapshot (quota discipline); consumers poll it on
   * their own cadence and warm the cache before first user query.
   *
   * Live shape (verified 2026-10-09): bare array of
   * `{ mint, decimals, symbol, creator, mintAuthority,
   * freezeAuthority, program, createAt, ... }`.
   *
   * @see https://api.rugcheck.xyz/swagger/index.html
   */
  public async getNewTokens(): Promise<ReadonlyArray<RugCheckNewToken> | null> {
    try {
      const { data } = await axios.get<unknown>(
        `${this.baseUrl}/stats/new_tokens`,
        { timeout: 5_000 },
      );
      if (!Array.isArray(data)) return null;
      return data as ReadonlyArray<RugCheckNewToken>;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      throwIfRetryableProviderError(err, 'rugcheck');
      this.logger.debug(
        `RugCheck new_tokens failed: ${(err as Error).message}`,
      );
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
