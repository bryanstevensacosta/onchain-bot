/**
 * Stream domain types (Tramo 3, todo 11, P49).
 *
 * On-demand ccxt streaming: clients subscribe to multiplexed
 * `watchTickers` / `watchOHLCVForSymbols` feeds over ONE shared WS
 * connection per exchange. Framework-agnostic: no Nest imports.
 */

export type StreamKind = 'ticker' | 'ohlcv';

export interface StreamSubscription {
  readonly exchange: string;
  readonly symbol: string;
  readonly kind: StreamKind;
  readonly timeframe?: string;
}

export interface TickerEvent {
  readonly kind: 'ticker';
  readonly exchange: string;
  readonly symbol: string;
  readonly price: number;
  readonly timestamp: string;
}

export interface OhlcvEvent {
  readonly kind: 'ohlcv';
  readonly exchange: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly timestamp: string;
}

export type StreamEvent = TickerEvent | OhlcvEvent;

export type StreamErrorCode =
  | 'EXCHANGE_DOWN'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'BAD_REQUEST'
  | 'TOO_MANY_SUBS';

export interface StreamErrorInfo {
  readonly code: StreamErrorCode;
  readonly message: string;
  readonly exchange?: string;
  readonly retryAfterMs?: number;
}

export interface StreamErrorMessage extends StreamErrorInfo {
  readonly kind: 'error';
}

export type StreamClientMessage = StreamEvent | StreamErrorMessage;

export function toErrorMessage(info: StreamErrorInfo): StreamErrorMessage {
  return { kind: 'error', ...info };
}

/** Canonical key: lowercased `exchange:symbol:kind[:timeframe]`. */
export function streamKey(
  sub: Pick<StreamSubscription, 'exchange' | 'symbol' | 'kind'> & { timeframe?: string },
): string {
  const base = `${sub.exchange.toLowerCase()}:${sub.symbol.toLowerCase()}:${sub.kind}`;
  return sub.kind === 'ohlcv' ? `${base}:${(sub.timeframe ?? '1m').toLowerCase()}` : base;
}
