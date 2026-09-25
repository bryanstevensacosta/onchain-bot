import type { StreamErrorInfo, StreamEvent, StreamSubscription } from './stream-types';

/**
 * Exchange WS port (Tramo 3, todo 11, P49 — stream domain).
 *
 * ccxt.pro-shaped contract: ONE connection per exchange instance,
 * multiplexing symbols via `watchTickers`-style watch/unwatch (plus
 * `watchOHLCVForSymbols`-style ohlcv legs). The manager holds exactly
 * one port per exchange and refcounts subscribers over it — clients
 * NEVER open their own exchange connections.
 */
export abstract class ExchangeWsPort {
  public abstract readonly exchange: string;

  public abstract get connected(): boolean;

  public abstract connect(): Promise<void>;

  public abstract disconnect(): Promise<void>;

  public abstract watch(subs: ReadonlyArray<StreamSubscription>): Promise<void>;

  public abstract unwatch(subs: ReadonlyArray<StreamSubscription>): Promise<void>;

  public abstract onEvent(listener: (event: StreamEvent) => void): void;

  public abstract onError(listener: (info: StreamErrorInfo) => void): void;
}

export interface ExchangeAdapterFactory {
  create(exchange: string): ExchangeWsPort;
}

export const EXCHANGE_ADAPTER_FACTORY = 'EXCHANGE_ADAPTER_FACTORY';
