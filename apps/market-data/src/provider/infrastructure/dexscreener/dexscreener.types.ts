export interface DexScreenerPair {
  readonly chainId: string;
  readonly dexId: string;
  readonly url: string;
  readonly pairAddress: string;
  readonly labels?: ReadonlyArray<string> | null;
  readonly baseToken: {
    readonly address: string;
    readonly name: string;
    readonly symbol: string;
  };
  readonly quoteToken: {
    readonly address: string | null;
    readonly name: string | null;
    readonly symbol: string | null;
  };
  readonly priceNative: string;
  readonly priceUsd: string | null;
  readonly txns: Record<
    string,
    { readonly buys: number; readonly sells: number }
  >;
  readonly volume: Record<string, number>;
  readonly priceChange: Record<string, number> | null;
  readonly liquidity: {
    readonly usd: number | null;
    readonly base: number;
    readonly quote: number;
  } | null;
  readonly fdv: number | null;
  readonly marketCap: number | null;
  readonly pairCreatedAt: number | null;
  readonly info?: {
    readonly imageUrl?: string | null;
    readonly websites?: ReadonlyArray<{ readonly url: string }> | null;
    readonly socials?: ReadonlyArray<{
      readonly platform: string;
      readonly handle: string;
    }> | null;
  } | null;
  readonly boosts?: { readonly active: number } | null;
}

export interface DexScreenerPairsResponse {
  readonly pairs: ReadonlyArray<DexScreenerPair> | null;
}

export interface DexScreenerSearchResponse {
  readonly pairs: ReadonlyArray<DexScreenerPair> | null;
}

export interface DexScreenerTokenProfile {
  readonly url: string;
  readonly chainId: string;
  readonly tokenAddress: string;
  readonly icon: string;
  readonly header: string | null;
  readonly description: string | null;
  readonly links: ReadonlyArray<{
    readonly type: string | null;
    readonly label: string | null;
    readonly url: string;
  }> | null;
}

export interface DexScreenerTokenBoost {
  readonly chainId: string;
  readonly tokenAddress: string;
  readonly url: string;
  readonly icon: string;
  readonly header: string | null;
  readonly description: string | null;
  readonly links: ReadonlyArray<{
    readonly type: string | null;
    readonly label: string | null;
    readonly url: string;
  }> | null;
  readonly totalBoosts: number;
  readonly amount: number;
}

export interface DexScreenerOrder {
  readonly chainId: string;
  readonly tokenAddress: string;
  readonly type: 'buy' | 'sell';
  readonly price: number;
  readonly volume: number;
  readonly amount: number;
  readonly total: number;
}

export interface DexScreenerOrdersResponse {
  readonly pairs: ReadonlyArray<{
    readonly chainId: string;
    readonly tokenAddress: string;
    readonly orders: ReadonlyArray<DexScreenerOrder>;
  }>;
}

export interface DexScreenerMeta {
  readonly description: string;
  readonly icon: { readonly type: string; readonly value: string };
  readonly name: string;
  readonly slug: string;
  readonly marketCap: number;
  readonly liquidity: number;
  readonly volume: number;
  readonly tokenCount: number;
  readonly marketCapChange: {
    readonly m5: number;
    readonly h1: number;
    readonly h6: number;
    readonly h24: number;
  };
  readonly marketCapDelta: {
    readonly m5: number;
    readonly h1: number;
    readonly h6: number;
    readonly h24: number;
  };
}

export interface DexScreenerPairSummary {
  readonly pairAddress: string;
  readonly dexId: string;
  /**
   * Raw pair labels from the best-liquidity pair (dexter venue-line,
   * plan todo 14): e.g. `['v3']` (PancakeSwap), `['wp']` (Orca
   * whirlpool). Empty when the pair carries none — never null, so the
   * snapshot venue resolver can pass them through verbatim.
   */
  readonly labels: ReadonlyArray<string>;
  readonly baseToken: {
    readonly address: string;
    readonly name: string;
    readonly symbol: string;
  };
  /**
   * Quote side of the best-liquidity pair (plan todo 20,
   * pair-side attribution fix).
   *
   * The summary used to carry `baseToken` only, so the identity step
   * reported the base side unconditionally — a quote-side query (e.g.
   * USDC in a PUMP/USDC pool) inherited the base identity
   * (USDC -> `PUMP`). Carrying both sides lets the fetcher verify
   * which side the requested mint is on and take that side's
   * symbol/name. Same shape as `baseToken`, but every field nullable:
   * upstream `quoteToken` is optional and its fields may be null.
   */
  readonly quoteToken: {
    readonly address: string | null;
    readonly name: string | null;
    readonly symbol: string | null;
  };
  readonly priceUsd: string | null;
  readonly priceNative: string;
  readonly liquidityUsd: number | null;
  readonly volume24h: number;
  readonly fdv: number | null;
  readonly marketCap: number | null;
  readonly priceChange24h: number | null;
  readonly txns24h: { readonly buys: number; readonly sells: number };
}
