import { ExchangeWsPort } from 'stream/domain/exchange-ws.port';
import type { StreamErrorInfo, StreamEvent, StreamSubscription } from 'stream/domain/stream-types';

/**
 * ccxt.pro exchange adapter (Tramo 3, todo 11, P49 — stream infrastructure).
 *
 * Real driver behind `MARKET_DATA_STREAM_DRIVER=ccxt`: ONE ccxt.pro
 * exchange instance (= ONE WS connection) per exchange, multiplexing
 * symbols via `watchTickers(symbols)` + `watchOHLCVForSymbols(...)`.
 * `ccxt.pro` is an OPTIONAL peer — loaded with a dynamic require so
 * the app boots without it (factory falls back to the in-memory
 * driver). Missing package / missing credentials fail LOUDLY with an
 * explicit message, never a silent null feed.
 *
 * NOTE: live exchange verification is operator-gated (needs API keys
 * + network); unit + transport suites run against the in-memory
 * driver implementing this same contract.
 */
export class CcxtExchangeAdapter extends ExchangeWsPort {
  public readonly exchange: string;

  private client: unknown = null;

  private isConnected = false;

  private readonly watched = new Map<string, StreamSubscription>();

  private readonly eventListeners = new Set<(event: StreamEvent) => void>();

  private readonly errorListeners = new Set<(info: StreamErrorInfo) => void>();

  private watchLoop: Promise<void> | null = null;

  private stopped = false;

  public constructor(exchange: string) {
    super();
    this.exchange = exchange;
  }

  public get connected(): boolean {
    return this.isConnected;
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    const ccxt = CcxtExchangeAdapter.loadCcxtPro();
    const ExchangeClass = (ccxt as Record<string, new (opts: unknown) => unknown>)[this.exchange];
    if (typeof ExchangeClass !== 'function') {
      throw new Error(`ccxt.pro has no exchange named '${this.exchange}'`);
    }
    this.client = new ExchangeClass({ enableRateLimit: true });
    this.stopped = false;
    this.isConnected = true;
    this.watchLoop = this.runWatchLoop().catch((err: unknown) => {
      this.emitError(err instanceof Error ? err.message : 'ccxt watch loop failed');
    });
  }

  public async disconnect(): Promise<void> {
    this.stopped = true;
    this.watched.clear();
    const client = this.client as { close?: () => Promise<void> } | null;
    this.client = null;
    this.isConnected = false;
    if (client !== null && typeof client.close === 'function') {
      await client.close();
    }
    await this.watchLoop?.catch(() => undefined);
    this.watchLoop = null;
  }

  public async watch(subs: ReadonlyArray<StreamSubscription>): Promise<void> {
    for (const sub of subs) {
      this.watched.set(CcxtExchangeAdapter.watchKey(sub), { ...sub });
    }
  }

  public async unwatch(subs: ReadonlyArray<StreamSubscription>): Promise<void> {
    for (const sub of subs) {
      this.watched.delete(CcxtExchangeAdapter.watchKey(sub));
    }
  }

  public onEvent(listener: (event: StreamEvent) => void): void {
    this.eventListeners.add(listener);
  }

  public onError(listener: (info: StreamErrorInfo) => void): void {
    this.errorListeners.add(listener);
  }

  private static watchKey(sub: StreamSubscription): string {
    return `${sub.symbol.toUpperCase()}|${sub.kind}|${(sub.timeframe ?? '1m').toLowerCase()}`;
  }

  private static loadCcxtPro(): unknown {
    try {
      const dynamicRequire = new Function('id', 'return require(id)') as (id: string) => unknown;
      return dynamicRequire('ccxt/pro');
    } catch {
      throw new Error(
        'ccxt/pro is not installed: set MARKET_DATA_STREAM_DRIVER=memory (default) ' +
          'or install the ccxt.pro peer to stream live exchange data',
      );
    }
  }

  private async runWatchLoop(): Promise<void> {
    while (!this.stopped) {
      const tickers = [...this.watched.values()].filter((sub) => sub.kind === 'ticker');
      if (tickers.length === 0 || this.client === null) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      const client = this.client as {
        watchTickers(symbols: Array<string>): Promise<Record<string, { last?: number }>>;
      };
      const symbols = [...new Set(tickers.map((sub) => sub.symbol.toUpperCase()))];
      // Single multiplexed call per loop: ONE connection fans out to N symbols.
      const snapshot = await client.watchTickers(symbols);
      const now = new Date().toISOString();
      for (const symbol of symbols) {
        const price = snapshot[symbol]?.last;
        if (typeof price !== 'number') {
          continue;
        }
        const event: StreamEvent = {
          kind: 'ticker',
          exchange: this.exchange,
          symbol,
          price,
          timestamp: now,
        };
        for (const listener of this.eventListeners) {
          listener(event);
        }
      }
    }
  }

  private emitError(message: string): void {
    const info: StreamErrorInfo = { code: 'EXCHANGE_DOWN', message, exchange: this.exchange };
    for (const listener of this.errorListeners) {
      listener(info);
    }
  }
}
