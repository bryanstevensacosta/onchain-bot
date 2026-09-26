import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  MARKET_DATA_BASE_URL,
  MARKET_DATA_TIMEOUT_MS,
} from '../../enrichment.tokens';
import {
  MarketData,
  MarketDataPort,
} from '../../domain/ports/market-data.port';

/** Default per-request timeout. SLO: p95 < 500ms once market-data is live (Tramo 3). */
export const HTTP_MARKET_DATA_DEFAULT_TIMEOUT_MS = 2000;

export const HTTP_MARKET_DATA_DEFAULT_BASE_URL = 'http://localhost:4000';

/**
 * HTTP market-data leaf (used when `USE_DATA_SERVICE_API=true`).
 *
 * `GET {baseUrl}/api/market-data/snapshot?chain=&address=` (compat edge,
 * Tramo 3 todo 5) with `x-api-key` when `MARKET_DATA_API_KEY` is set
 * (fail-open empty = keyless dev, backend-mirror). Every failure mode —
 * non-ok status, transport error, timeout via AbortController — resolves
 * null with a warn (fallback + alert surface: the orchestrator records
 * the provider error and the local cascade serves next). SLO: p95<500ms
 * measured in `.omo/evidence/task-5-mega-refactor-market-data.log`.
 */
@Injectable()
export class HttpMarketDataAdapter extends MarketDataPort {
  public readonly name = 'http-market-data';
  private readonly logger = new Logger(HttpMarketDataAdapter.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly apiKey: string;

  public constructor(
    @Optional()
    @Inject(MARKET_DATA_BASE_URL)
    baseUrl?: string,
    @Optional()
    @Inject(MARKET_DATA_TIMEOUT_MS)
    timeoutMs?: number,
  ) {
    super();
    this.baseUrl =
      baseUrl ??
      process.env.MARKET_DATA_URL ??
      HTTP_MARKET_DATA_DEFAULT_BASE_URL;
    this.timeoutMs = timeoutMs ?? HTTP_MARKET_DATA_DEFAULT_TIMEOUT_MS;
    this.apiKey = process.env.MARKET_DATA_API_KEY ?? '';
  }

  public async fetch(
    chain: string,
    address: string,
  ): Promise<MarketData | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url =
        `${this.baseUrl}/api/market-data/snapshot` +
        `?chain=${encodeURIComponent(chain)}` +
        `&address=${encodeURIComponent(address)}`;
      this.logger.debug(`GET ${url}`);
      const headers: Record<string, string> =
        this.apiKey === '' ? {} : { 'x-api-key': this.apiKey };
      const res = await fetch(url, { signal: controller.signal, headers });
      if (!res.ok) {
        this.logger.warn(
          `market-data responded ${res.status} — null, local cascade serves next`,
        );
        return null;
      }
      const body = (await res.json()) as Partial<MarketData>;
      return {
        priceUsd: body.priceUsd ?? null,
        liquidityUsd: body.liquidityUsd ?? null,
        volume24hUsd: body.volume24hUsd ?? null,
        marketCapUsd: body.marketCapUsd ?? null,
        fdvUsd: body.fdvUsd ?? null,
        priceChange24h: body.priceChange24h ?? null,
        holders: body.holders ?? null,
        top10HolderPercent: body.top10HolderPercent ?? null,
        symbol: body.symbol ?? null,
        name: body.name ?? null,
        lockedLiquidityPercent: body.lockedLiquidityPercent ?? null,
        burnedPercent: body.burnedPercent ?? null,
      };
    } catch (err) {
      this.logger.warn(
        `market-data fetch failed (${(err as Error).message}) — null, local cascade serves next`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
