export interface CcxtTicker {
  readonly symbol: string;
  readonly last: number | null;
}

export interface CcxtOhlcvCandle {
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export type CcxtLibLoader = () => unknown;
