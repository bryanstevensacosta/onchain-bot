import { ChainId } from 'shared/common/value-objects/chain-id.vo';

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
}

/**
 * Outbound port: a single third-party market data provider
 * (DexScreener, GeckoTerminal, Birdeye).
 *
 * `supportedChains` declares which chains this provider can fetch.
 * `fetch()` returns null when the provider has no data (404, no pairs),
 * not just on transport errors. Throws only on hard failures.
 */
export abstract class MarketDataProviderPort {
  public abstract readonly name: string;
  public abstract readonly supportedChains: ReadonlyArray<ChainId>;
  public abstract fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null>;
}
