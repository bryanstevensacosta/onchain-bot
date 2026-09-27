export interface BirdeyeTokenOverviewData {
  readonly address: string;
  readonly price: number | null;
  readonly priceChange24h: number | null;
  readonly volume24h: number | null;
  readonly liquidity: number | null;
  readonly mc: number | null;
  readonly totalSupply: number | null;
  readonly holder: number | null;
  readonly decimals: number | null;
  readonly name: string | null;
  readonly symbol: string | null;
}

export interface BirdeyeResponse<T> {
  readonly success: boolean;
  readonly data: T | null;
}

export interface BirdeyePriceData {
  readonly value: number;
  readonly updateUnixTime: number;
  readonly updateHumanTime: string;
}

export interface BirdeyeTokenTrade {
  readonly txHash: string;
  readonly blockUnixTime: number;
  readonly type: 'buy' | 'sell';
  readonly price: number;
  readonly volume: number;
  readonly mint: string;
}

export interface BirdeyeTradesData {
  readonly items: ReadonlyArray<BirdeyeTokenTrade>;
  readonly hasMore: boolean;
}

export interface BirdeyeHolderTagEntry {
  readonly tag: string;
  readonly count?: number | null;
  readonly holdAmount?: number | null;
  readonly percentOfSupply?: number | null;
  readonly pnlUsd?: number | null;
}

export interface BirdeyeHolderProfileData {
  readonly address: string;
  readonly holderCount?: number | null;
  readonly tags?: ReadonlyArray<BirdeyeHolderTagEntry> | null;
  readonly devHoldAmount?: number | null;
  readonly devPercentOfSupply?: number | null;
  readonly devPnlUsd?: number | null;
}

export interface BirdeyeHolderPosition {
  readonly wallet: string;
  readonly holdAmount: number | null;
  readonly percentOfSupply: number | null;
  readonly pnlUsd: number | null;
  readonly tag?: string | null;
}

export interface BirdeyeHolderPositionsData {
  readonly items: ReadonlyArray<BirdeyeHolderPosition>;
  readonly hasMore?: boolean;
}
