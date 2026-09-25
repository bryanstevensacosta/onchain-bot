import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'token/enrichment/domain/ports/market-data-provider.port';

export const HTTP_MARKET_DATA_DEFAULT_BASE_URL = 'http://localhost:4000';
export const HTTP_MARKET_DATA_DEFAULT_TIMEOUT_MS = 2000;

/**
 * Returns true only when the operator explicitly points the backend at
 * the market-data service (Tramo 3, todo 5, G-17). Default false: the
 * in-process cascade serves traffic until the server returns real
 * aggregators (todo 3 remainder) and the staged rollout
 * (dev → staging → prod) reaches the env.
 */
export function useDataServiceApi(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.USE_DATA_SERVICE_API === 'true';
}

/**
 * HTTP market-data leaf for the backend cascade (Tramo 3, todo 5).
 *
 * `GET {baseUrl}/api/market-data/snapshot?chain=&address=` with
 * `x-api-key` when `MARKET_DATA_API_KEY` is set (fail-open empty =
 * keyless dev). Maps the compat edge onto the backend `MarketData`
 * shape (`pairs: []`, `imageUrls: []` — pair-level detail stays
 * local-only until the server aggregates it). Every failure mode
 * resolves null with a warn so the in-process cascade serves next
 * (adversarial: fallback + alert via the use-case `errors` list and
 * `EnrichmentFailedEvent` on all-fail — never a silent null).
 */
@Injectable()
export class HttpMarketDataAdapter extends MarketDataProviderPort {
  public readonly name = 'http-market-data';
  private readonly logger = new Logger(HttpMarketDataAdapter.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly apiKey: string;

  public constructor() {
    super();
    this.baseUrl =
      process.env.MARKET_DATA_URL ?? HTTP_MARKET_DATA_DEFAULT_BASE_URL;
    const parsed = parseInt(
      process.env.MARKET_DATA_TIMEOUT_MS ??
        String(HTTP_MARKET_DATA_DEFAULT_TIMEOUT_MS),
      10,
    );
    this.timeoutMs = Number.isNaN(parsed)
      ? HTTP_MARKET_DATA_DEFAULT_TIMEOUT_MS
      : parsed;
    this.apiKey = process.env.MARKET_DATA_API_KEY ?? '';
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url =
        `${this.baseUrl}/api/market-data/snapshot` +
        `?chain=${encodeURIComponent(chain.value)}` +
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
        pairs: [],
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
        imageUrls: [],
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
