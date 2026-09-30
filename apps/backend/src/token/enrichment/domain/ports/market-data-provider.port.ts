import { ChainId } from 'chain/identity/chain-id.vo';

export interface MarketData {
  readonly pairs: ReadonlyArray<{
    readonly address: string;
    readonly dexId: string;
    readonly quoteToken: string;
    readonly reserveUsd: number;
  }>;
  readonly priceUsd: number | null;
  readonly totalSupply?: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly priceChange24h: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  /** Token symbol/ticker (e.g. "PEPE") — first non-null from providers wins */
  readonly symbol: string | null;
  /** Token display name (e.g. "Pepe") — first non-null from providers wins */
  readonly name: string | null;
  /** Token logo/image URLs — accumulate all from providers for fallback chain */
  readonly imageUrls: ReadonlyArray<string>;
  /** Percentage of total liquidity that is locked (0–100) */
  readonly lockedLiquidityPercent: number | null;
  /** Percentage of total supply that has been burned (0–100) */
  readonly burnedPercent: number | null;
  /** Percentage of supply held by insiders/bundlers/dev (rug signals) */
  readonly insidersPercent?: number | null;
  readonly bundlersPercent?: number | null;
  readonly devPercent?: number | null;
  readonly bondingPercent?: number | null;
  readonly factory?: string | null;
}

/**
 * Outbound port: a single third-party market data provider
 * (DexScreener, GeckoTerminal, Birdeye).
 *
 * @deprecated Legacy backend enrichment port (Tramo 3 todo 6, R-4/G-18).
 * The `market-data` name now belongs to `apps/market-data` (canonical owner
 * of providers since todo 4; its port is `MarketDataPort` in
 * `apps/market-data` + `apps/kol-system/src/enrichment/domain/ports/`).
 * New code must use {@link LegacyEnrichmentPort} (same class, unambiguous
 * name) or the canonical market-data port. Removed at cutover (todo 8).
 * Do not extend this name in new code.
 *
 * v2: chain capability filtering is done by the registry at injection time
 * (DI) — providers no longer declare `supportedChains`. The DI container
 * is responsible for routing providers to the right chains.
 *
 * `fetch()` returns null when the provider has no data (404, no pairs),
 * not just on transport errors. Throws only on hard failures.
 */
export abstract class MarketDataProviderPort {
  public abstract readonly name: string;
  public abstract fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null>;
}

/**
 * Unambiguous alias for the legacy backend enrichment port.
 * Justification for alias-over-rename (worker veto, todo 6): a hard rename
 * would touch 15 files (10 adapters + use-case + module + spec + DI token
 * `MARKET_DATA_PROVIDERS`) mid dual-run for zero runtime gain, while the
 * canonical `MarketDataPort` already exists in two new apps. The alias gives
 * new code a collision-free name with no DI churn; the old name dies with
 * this module at cutover (todo 8).
 */
export type LegacyEnrichmentPort = MarketDataProviderPort;
