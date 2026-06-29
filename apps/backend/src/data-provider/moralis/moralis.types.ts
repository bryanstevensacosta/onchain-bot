export interface MoralisAnalyticsResponse {
  readonly usdPrice?: string | null;
  readonly totalLiquidityUsd?: string | null;
  readonly totalFullyDilutedValuation?: string | null;
  readonly pricePercentChange?: { readonly '24h'?: number | null };
}

export interface MoralisHoldersResponse {
  readonly totalHolders?: string | number | null;
  readonly holderSupply?: {
    readonly top10?: { readonly supplyPercent?: string | number | null };
  };
}

export interface MoralisMetadataResponse {
  readonly logo?: string | null;
  readonly logo_hash?: string | null;
}

export interface MoralisTokenPriceResponse {
  readonly usdPrice?: string | null;
  readonly usdPriceFormatted?: string | null;
  readonly tokenName?: string;
  readonly tokenSymbol?: string;
  readonly tokenLogo?: string;
}

export interface MoralisWalletBalance {
  readonly tokenAddress?: string;
  readonly name?: string;
  readonly symbol?: string;
  readonly logo?: string;
  readonly balance?: string;
  readonly balanceFormatted?: string;
  readonly usdValue?: string;
  readonly percentageRelativeToTotal?: string;
}

export interface MoralisWalletBalancesResponse {
  readonly result?: ReadonlyArray<MoralisWalletBalance>;
}

/** Normalised return type for getTokenAnalytics. */
export interface MoralisTokenAnalytics {
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly fdvUsd: number | null;
  readonly priceChange24h: number | null;
}

/** Normalised return type for getTokenHolders. */
export interface MoralisTokenHolderSummary {
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
}
