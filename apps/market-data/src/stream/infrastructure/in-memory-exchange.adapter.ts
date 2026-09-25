import { ExchangeWsPort } from 'stream/domain/exchange-ws.port';
import type { StreamErrorInfo, StreamEvent, StreamSubscription } from 'stream/domain/stream-types';

/**
 * In-memory exchange adapter (Tramo 3, todo 11, P49 — stream infrastructure).
 *
 * Deterministic stand-in for the ccxt.pro adapter implementing the
 * SAME ExchangeWsPort contract (one connection, multiplexed watch).
 * Default driver for dev/test/live-transport checks; the real ccxt
 * driver (`CcxtExchangeAdapter`, `MARKET_DATA_STREAM_DRIVER=ccxt`)
 * needs exchange credentials + network and stays operator-gated.
 *
 * Ticks are synthetic and emitted ONLY via `pump()` (tests) or the
 * optional interval (live): no timers run unless symbols are watched,
 * and the interval stops when the last symbol leaves.
 */
export class InMemoryExchangeAdapter extends ExchangeWsPort {
  public readonly exchange: string;

  private isConnected = false;

  private connects = 0;

  private readonly watched = new Map<string, StreamSubscription>();

  private readonly eventListeners = new Set<(event: StreamEvent) => void>();

  private readonly errorListeners = new Set<(info: StreamErrorInfo) => void>();

  private timer: ReturnType<typeof setInterval> | null = null;

  private sequence = 0;

  public constructor(exchange: string) {
    super();
    this.exchange = exchange;
  }

  public get connected(): boolean {
    return this.isConnected;
  }

  public get connectCount(): number {
    return this.connects;
  }

  public async connect(): Promise<void> {
    if (!this.isConnected) {
      this.isConnected = true;
      this.connects += 1;
    }
  }

  public async disconnect(): Promise<void> {
    this.stopTimer();
    this.watched.clear();
    this.isConnected = false;
  }

  public async watch(subs: ReadonlyArray<StreamSubscription>): Promise<void> {
    for (const sub of subs) {
      const key = `${sub.symbol.toUpperCase()}|${sub.kind}|${(sub.timeframe ?? '1m').toLowerCase()}`;
      this.watched.set(key, { ...sub, symbol: sub.symbol.toUpperCase() });
    }
    this.maybeStartTimer();
  }

  public async unwatch(subs: ReadonlyArray<StreamSubscription>): Promise<void> {
    for (const sub of subs) {
      const key = `${sub.symbol.toUpperCase()}|${sub.kind}|${(sub.timeframe ?? '1m').toLowerCase()}`;
      this.watched.delete(key);
    }
    if (this.watched.size === 0) {
      this.stopTimer();
    }
  }

  public onEvent(listener: (event: StreamEvent) => void): void {
    this.eventListeners.add(listener);
  }

  public onError(listener: (info: StreamErrorInfo) => void): void {
    this.errorListeners.add(listener);
  }

  public watchedSymbols(): Array<string> {
    return [...this.watched.values()].map((sub) => sub.symbol);
  }

  /** Emit one synthetic tick per watched subscription (deterministic). */
  public pump(): void {
    this.sequence += 1;
    for (const sub of this.watched.values()) {
      if (sub.kind === 'ohlcv') {
        const price = 100 + this.sequence;
        const event: StreamEvent = {
          kind: 'ohlcv',
          exchange: this.exchange,
          symbol: sub.symbol,
          timeframe: (sub.timeframe ?? '1m').toLowerCase(),
          open: price - 1,
          high: price + 1,
          low: price - 2,
          close: price,
          volume: this.sequence * 10,
          timestamp: new Date().toISOString(),
        };
        for (const listener of this.eventListeners) {
          listener(event);
        }
      } else {
        const event: StreamEvent = {
          kind: 'ticker',
          exchange: this.exchange,
          symbol: sub.symbol,
          price: 100 + this.sequence,
          timestamp: new Date().toISOString(),
        };
        for (const listener of this.eventListeners) {
          listener(event);
        }
      }
    }
  }

  /** Adversarial hook: simulate the exchange endpoint going down. */
  public simulateDown(message: string): void {
    this.isConnected = false;
    this.stopTimer();
    const info: StreamErrorInfo = {
      code: 'EXCHANGE_DOWN',
      message,
      exchange: this.exchange,
    };
    for (const listener of this.errorListeners) {
      listener(info);
    }
  }

  private maybeStartTimer(): void {
    if (this.timer !== null || this.watched.size === 0) {
      return;
    }
    this.timer = setInterval(() => this.pump(), 250);
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      (this.timer as unknown as { unref(): void }).unref();
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
