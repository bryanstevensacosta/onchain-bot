export interface MobulaMarketToken {
  readonly address?: string;
  readonly priceUSD?: number | null;
  readonly approximateReserveUSD?: number | null;
  readonly marketCapUSD?: number | null;
  readonly marketCapDilutedUSD?: number | null;
  readonly totalSupply?: number | null;
  readonly top10HoldingsPercentage?: number | null;
  readonly insidersHoldingsPercentage?: number | null;
  readonly bundlersHoldingsPercentage?: number | null;
  readonly devHoldingsPercentage?: number | null;
  readonly bondingPercentage?: number | null;
  readonly factory?: string | null;
  readonly source?: string | null;
}

export interface MobulaMarketResponse {
  readonly data?: ReadonlyArray<{ readonly base?: MobulaMarketToken }>;
}

export interface MobulaWalletPortfolio {
  readonly totalUsd?: number;
  readonly assets?: ReadonlyArray<{
    readonly address: string;
    readonly symbol: string;
    readonly balanceUSD: number;
  }>;
}

export interface MobulaHistoryEntry {
  readonly timestamp: number;
  readonly price: number;
  readonly volume: number;
}

export interface MobulaHistoryResponse {
  readonly data?: ReadonlyArray<MobulaHistoryEntry>;
}

export interface MobulaMetadata {
  readonly name?: string;
  readonly symbol?: string;
  readonly icon?: string;
  readonly decimals?: number;
}

export interface MobulaMetadataResponse {
  readonly data?: {
    readonly name?: string;
    readonly symbol?: string;
    readonly icon?: string;
    readonly decimals?: number;
  };
}
