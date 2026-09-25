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
