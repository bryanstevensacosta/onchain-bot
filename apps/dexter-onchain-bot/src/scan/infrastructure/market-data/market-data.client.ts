import { Injectable, Logger } from '@nestjs/common';

/**
 * market-data HTTP client (Tramo 3, todo 9, P13 — NEW).
 *
 * The ONLY market-data source for dexter-onchain-bot (todo 5 bridge,
 * default-true here): `GET {baseUrl}/api/market-data/snapshot` (the
 * exact compat edge the backend `HttpMarketDataAdapter` already calls)
 * with `x-api-key` when `MARKET_DATA_API_KEY` is set (fail-open empty =
 * keyless dev). Every failure resolves null with a warn — the caller
 * reports an explicit message, never a silent partial card.
 */

export interface MarketDataSnapshot {
  readonly chain: string;
  readonly address: string;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly priceUsd: number | null;
  readonly priceChange24h: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly lockedLiquidityPercent: number | null;
  readonly burnedPercent: number | null;
  readonly volume24hUsd: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly status: string | null;
}

const CANDIDATE_CHAINS = [
  'solana',
  'ethereum',
  'base',
  'bsc',
  'arbitrum',
  'polygon',
] as const;

@Injectable()
export class MarketDataClient {
  private readonly logger = new Logger(MarketDataClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  public constructor() {
    this.baseUrl = process.env.MARKET_DATA_URL ?? 'http://localhost:4000';
    this.apiKey = process.env.MARKET_DATA_API_KEY ?? '';
    const parsed = Number(process.env.MARKET_DATA_TIMEOUT_MS ?? 2000);
    this.timeoutMs = Number.isNaN(parsed) ? 2000 : parsed;
  }

  public async getSnapshot(
    chain: string,
    address: string,
  ): Promise<MarketDataSnapshot | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url =
        `${this.baseUrl}/api/market-data/snapshot` +
        `?chain=${encodeURIComponent(chain)}` +
        `&address=${encodeURIComponent(address)}`;
      const headers: Record<string, string> =
        this.apiKey === '' ? {} : { 'x-api-key': this.apiKey };
      const res = await fetch(url, { signal: controller.signal, headers });
      if (!res.ok) {
        this.logger.warn(`market-data responded ${res.status} — null`);
        return null;
      }
      const body = (await res.json()) as Partial<MarketDataSnapshot>;
      return {
        chain: typeof body.chain === 'string' ? body.chain : chain,
        address: typeof body.address === 'string' ? body.address : address,
        symbol: body.symbol ?? null,
        name: body.name ?? null,
        priceUsd: body.priceUsd ?? null,
        priceChange24h: body.priceChange24h ?? null,
        marketCapUsd: body.marketCapUsd ?? null,
        fdvUsd: body.fdvUsd ?? null,
        liquidityUsd: body.liquidityUsd ?? null,
        lockedLiquidityPercent: body.lockedLiquidityPercent ?? null,
        burnedPercent: body.burnedPercent ?? null,
        volume24hUsd: body.volume24hUsd ?? null,
        holders: body.holders ?? null,
        top10HolderPercent: body.top10HolderPercent ?? null,
        status: body.status ?? null,
      };
    } catch (err) {
      this.logger.warn(
        `market-data fetch failed (${err instanceof Error ? err.message : 'unknown'}) — null`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Resolves a bare address without a chain qualifier: tries candidate
   * chains in order and returns the first snapshot carrying identity
   * (symbol or name). A snapshot with only nulls (pending shell) does
   * NOT count — the address stays unresolved.
   */
  public async resolveAny(
    address: string,
  ): Promise<{ chain: string; snapshot: MarketDataSnapshot } | null> {
    for (const chain of CANDIDATE_CHAINS) {
      const snapshot = await this.getSnapshot(chain, address);
      if (!snapshot) continue;
      if (snapshot.symbol !== null || snapshot.name !== null) {
        return { chain, snapshot };
      }
    }
    return null;
  }
}
