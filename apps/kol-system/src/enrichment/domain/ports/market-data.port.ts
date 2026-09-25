/**
 * MarketDataPort — outbound leaf port for market data (Tramo 1, todo 8, P7).
 *
 * Read-only mirror of the backend
 * `apps/backend/src/token/enrichment/domain/ports/market-data-provider.port.ts`
 * `MarketData` shape (trimmed to the fields kol-system needs; C-DATA-01: no
 * providers are moved here, this interface is copied read-only so the
 * first-non-null merge below stays compatible with the backend cascade).
 *
 * Security posture: rug signals travel as a GROUP
 * (`lockedLiquidityPercent` + `burnedPercent` + `top10HolderPercent`) —
 * never gate on a single field (scoring gates land in todo 9).
 */
export interface MarketData {
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  /** `mc at`: market cap at capture time (snapshot semantics, see orchestrator). */
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly priceChange24h: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly lockedLiquidityPercent: number | null;
  readonly burnedPercent: number | null;
}

/** All-null market data: provider had nothing (404 / no pairs / down). */
export function emptyMarketData(): MarketData {
  return {
    priceUsd: null,
    liquidityUsd: null,
    volume24hUsd: null,
    marketCapUsd: null,
    fdvUsd: null,
    priceChange24h: null,
    holders: null,
    top10HolderPercent: null,
    symbol: null,
    name: null,
    lockedLiquidityPercent: null,
    burnedPercent: null,
  };
}

/**
 * Leaf provider: one market-data source (local stub today, HTTP market-data
 * service once `USE_DATA_SERVICE_API=true` in Tramo 3).
 *
 * `fetch()` returns null when the provider has no data — it throws only on
 * hard failures. Callers MUST treat both as "no data from this provider"
 * (silent-null fallback) and continue the cascade.
 */
export abstract class MarketDataPort {
  public abstract readonly name: string;
  public abstract fetch(
    chain: string,
    address: string,
  ): Promise<MarketData | null>;
}
