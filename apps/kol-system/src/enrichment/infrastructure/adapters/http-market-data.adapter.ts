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

/** Default base URL of the market-data service (Tramo 3; unreachable in Tramo 1). */
export const HTTP_MARKET_DATA_DEFAULT_BASE_URL = 'http://localhost:3060';

/**
 * HTTP market-data leaf (STUB — used only when `USE_DATA_SERVICE_API=true`).
 *
 * Tramo 1 never enables it (flag defaults false; C-DATA-01: no calls to
 * market-data yet). Every failure mode — non-ok status, transport error,
 * timeout via AbortController — resolves null (silent-null fallback) so the
 * orchestrator cascade continues. Documented SLO once live: p95 < 500ms.
 */
@Injectable()
export class HttpMarketDataAdapter extends MarketDataPort {
  public readonly name = 'http-market-data';
  private readonly logger = new Logger(HttpMarketDataAdapter.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

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
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        this.logger.warn(`market-data responded ${res.status} — silent null`);
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
        `market-data fetch failed (${(err as Error).message}) — silent null`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
