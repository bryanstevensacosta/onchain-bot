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

/**
 * One `GET /defi/v3/ohlcv` item (dexter plan todo 55, keyed WENCAT-class
 * leg). Shape verified live 2026-10-17 (WENCAT bsc, `type=1H`, keyed):
 * `unix_time` is epoch SECONDS and every price/volume field arrives as
 * a number (typed liberally here — numeric strings are tolerated by the
 * adapter mapping, same as the Gecko OHLCV mapper).
 */
export interface BirdeyeOhlcvItem {
  readonly unix_time?: number | string | null;
  readonly o?: number | string | null;
  readonly h?: number | string | null;
  readonly l?: number | string | null;
  readonly c?: number | string | null;
  readonly v?: number | string | null;
}

export interface BirdeyeOhlcvData {
  readonly items?: ReadonlyArray<BirdeyeOhlcvItem> | null;
}

/**
 * Birdeye OHLCV row normalized to the verbatim Gecko tuple order
 * (`[timestampSec, open, high, low, close, volume]`, epoch seconds) so
 * the snapshot OHLC backfill consumes ONE candle shape regardless of
 * source. Structurally identical to `GeckoOhlcvCandle`/`OhlcvCandle`.
 */
export type BirdeyeOhlcvCandle = readonly [
  timestampSec: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
];

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

/**
 * Token security scan result (`GET /defi/token_security`, 25 CU).
 *
 * Shape note (honest): the endpoint docs enumerate the security
 * dimensions (ownership/mint/LP/sellability) but this lane verified no
 * live response schema against the keyed endpoint (no key use in
 * probes), so the type stays open — consumers read known fields
 * defensively. `address` echoes the queried mint when present.
 */
export interface BirdeyeTokenSecurityData {
  readonly address?: string | null;
  readonly [field: string]: unknown;
}
