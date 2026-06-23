import { ChainId } from 'chain/identity/chain-id.vo';

export interface MarketData {
  readonly pairs: ReadonlyArray<{
    readonly address: string;
    readonly dexId: string;
    readonly quoteToken: string;
    readonly reserveUsd: number;
  }>;
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly priceChange24h: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  /** Token display name (e.g. "Pepe") — first non-null from providers wins */
  readonly name: string | null;
  /** Token logo/image URLs — accumulate all from providers for fallback chain */
  readonly imageUrls: ReadonlyArray<string>;
  /** Percentage of total liquidity that is locked (0–100) */
  readonly lockedLiquidityPercent: number | null;
  /** Percentage of total supply that has been burned (0–100) */
  readonly burnedPercent: number | null;
}

/**
 * Outbound port: a single third-party market data provider
 * (DexScreener, GeckoTerminal, Birdeye).
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
