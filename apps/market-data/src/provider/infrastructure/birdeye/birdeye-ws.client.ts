import {
  BIRDEYE_WS_PING_INTERVAL_MS,
  BIRDEYE_WS_PROTOCOL,
  BIRDEYE_WS_URL,
  buildNewPairSubscribe,
  buildPriceSubscribe,
  buildTxsSubscribe,
} from './birdeye-ws.types';

/**
 * Minimal socket surface the adapter needs. The default factory wraps
 * the hoisted `ws` package (dynamic require, loud failure — same
 * precedent as `CcxtExchangeAdapter.loadCcxtPro`); tests inject a mock.
 *
 * NOTE: server ping frames are answered by the transport itself (`ws`
 * auto-pongs); the adapter additionally sends a periodic client ping
 * as an idle-NAT keepalive.
 */
export interface BirdeyeSocket {
  send(data: string): void;
  ping(): void;
  close(): void;
  on(event: 'open' | 'message' | 'close' | 'error' | 'pong', listener: (...args: Array<unknown>) => void): void;
  removeAllListeners(): void;
}

export type BirdeyeSocketFactory = (
  url: string,
  protocols: string,
  headers: Record<string, string>,
) => BirdeyeSocket;

export interface BirdeyeWsAdapterOptions {
  readonly socketFactory?: BirdeyeSocketFactory;
  readonly pingIntervalMs?: number;
}

/**
 * Broker-shaped events (structurally identical to `stream/domain/
 * stream-types` — deliberately NOT imported: the backend dual-run shim
 * compiles these files without the market-data `stream/*` alias, so
 * this module stays dependency-free outside its own directory).
 */
export type BirdeyeStreamEvent =
  | {
      readonly kind: 'ticker';
      readonly exchange: 'birdeye';
      readonly symbol: string;
      readonly price: number;
      readonly timestamp: string;
    }
  | {
      readonly kind: 'ohlcv';
      readonly exchange: 'birdeye';
      readonly symbol: string;
      readonly timeframe: '1m';
      readonly open: number;
      readonly high: number;
      readonly low: number;
      readonly close: number;
      readonly volume: number;
      readonly timestamp: string;
    };

export interface BirdeyeStreamError {
  readonly code: 'EXCHANGE_DOWN';
  readonly message: string;
  readonly exchange: 'birdeye';
}

/** Stream-shaped subscription (same fields the broker passes through). */
export interface BirdeyeWatchRequest {
  readonly exchange: string;
  readonly symbol: string;
  readonly kind: 'ticker' | 'ohlcv';
  readonly timeframe?: string;
}

/**
 * Birdeye WS client as a DEX source for the stream/ broker (Tramo 3 —
 * Birdeye WS realtime).
 *
 * ONE socket per adapter (`exchange = 'birdeye'`), multiplexing every
 * watched mint over it: `SUBSCRIBE_PRICE` (1m/usd) + `SUBSCRIBE_TXS`
 * (combined `complex` queries — the gateway overwrites one SUBSCRIBE_*
 * per type, so the full mint list is resent on every change) +
 * `SUBSCRIBE_NEW_PAIR` (chain-wide discovery, resent per connection).
 *
 * On `symbol` the caller passes the token MINT address verbatim
 * (base58 is case-sensitive — never normalized).
 *
 * Failure contract (P49-shaped, mirrors the ccxt/in-memory adapters):
 * a server close/error flips `connected` to false and fans out ONE
 * `EXCHANGE_DOWN` error — reconnect backoff (1s→30s) + re-watch live in
 * `ExchangeConnectionManager`, which replays the surviving watch-list
 * through `watch()` on the fresh handshake.
 */
export class BirdeyeWsAdapter {
  public readonly exchange = 'birdeye';

  private readonly apiKey: string;

  private readonly socketFactory: BirdeyeSocketFactory;

  private readonly pingIntervalMs: number;

  private socket: BirdeyeSocket | null = null;

  private isConnected = false;

  private readonly watched = new Map<string, { ticker: boolean; ohlcv: boolean }>();

  private readonly eventListeners = new Set<(event: BirdeyeStreamEvent) => void>();

  private readonly errorListeners = new Set<(info: BirdeyeStreamError) => void>();

  private pingTimer: ReturnType<typeof setInterval> | null = null;

  public constructor(apiKey: string, opts?: BirdeyeWsAdapterOptions) {
    this.apiKey = (apiKey ?? '').trim();
    this.socketFactory = opts?.socketFactory ?? BirdeyeWsAdapter.defaultSocketFactory;
    this.pingIntervalMs = opts?.pingIntervalMs ?? BIRDEYE_WS_PING_INTERVAL_MS;
  }

  public get connected(): boolean {
    return this.isConnected;
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    if (this.apiKey === '') {
      throw new Error('BIRDEYE_API_KEY missing — Birdeye WS stays disconnected (never a silent dark feed)');
    }
    const url = `${BIRDEYE_WS_URL}?x-api-key=${this.apiKey}`;
    const socket = this.socketFactory(url, BIRDEYE_WS_PROTOCOL, {
      Origin: 'ws://public-api.birdeye.so',
      'X-API-KEY': this.apiKey,
    });
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Birdeye WS connection timeout')), 15_000);
      socket.on('open', () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.startKeepalive();
        this.send({ ...buildNewPairSubscribe() });
        this.resubscribeAll();
        resolve();
      });
      socket.on('error', (...args: Array<unknown>) => {
        clearTimeout(timeout);
        if (!this.isConnected) {
          const err = args[0];
          reject(err instanceof Error ? err : new Error('Birdeye WS connection failed'));
        }
      });
    });
    socket.on('message', (...args: Array<unknown>) => this.routePush(args[0]));
    socket.on('close', () => this.handleDown('Birdeye WS connection closed'));
    socket.on('error', (...args: Array<unknown>) => {
      if (this.isConnected) {
        const err = args[0];
        this.handleDown(err instanceof Error ? err.message : 'Birdeye WS error');
      }
    });
  }

  public async disconnect(): Promise<void> {
    this.stopKeepalive();
    this.watched.clear();
    const socket = this.socket;
    this.socket = null;
    this.isConnected = false;
    if (socket !== null) {
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
        // Close is best-effort; the adapter is already marked down.
      }
    }
  }

  public async watch(subs: ReadonlyArray<BirdeyeWatchRequest>): Promise<void> {
    for (const sub of subs) {
      if (sub.exchange.toLowerCase() !== 'birdeye' || sub.symbol.trim() === '') {
        continue;
      }
      const held = this.watched.get(sub.symbol) ?? { ticker: false, ohlcv: false };
      if (sub.kind === 'ohlcv') {
        held.ohlcv = true;
      } else {
        held.ticker = true;
      }
      this.watched.set(sub.symbol, held);
    }
    this.resubscribeAll();
  }

  public async unwatch(subs: ReadonlyArray<BirdeyeWatchRequest>): Promise<void> {
    for (const sub of subs) {
      const held = this.watched.get(sub.symbol);
      if (!held) {
        continue;
      }
      if (sub.kind === 'ohlcv') {
        held.ohlcv = false;
      } else {
        held.ticker = false;
      }
      if (!held.ticker && !held.ohlcv) {
        this.watched.delete(sub.symbol);
      }
    }
    this.resubscribeAll();
  }

  public onEvent(listener: (event: BirdeyeStreamEvent) => void): void {
    this.eventListeners.add(listener);
  }

  public onError(listener: (info: BirdeyeStreamError) => void): void {
    this.errorListeners.add(listener);
  }

  public watchedSymbols(): Array<string> {
    return [...this.watched.keys()];
  }

  private static defaultSocketFactory(
    url: string,
    protocols: string,
    headers: Record<string, string>,
  ): BirdeyeSocket {
    let WsCtor: new (
      url: string,
      protocols: string,
      opts: { headers: Record<string, string> },
    ) => {
      send(data: string): void;
      ping(): void;
      close(): void;
      on(event: string, listener: (...args: Array<unknown>) => void): void;
      removeAllListeners(): void;
    };
    try {
      const dynamicRequire: NodeRequire = require;
      WsCtor = dynamicRequire('ws') as typeof WsCtor;
    } catch {
      throw new Error('ws is not installed: Birdeye WS needs the hoisted ws package (no new deps declared)');
    }
    const raw = new WsCtor(url, protocols, { headers });
    return {
      send: (data: string): void => raw.send(data),
      ping: (): void => raw.ping(),
      close: (): void => raw.close(),
      on: (event: string, listener: (...args: Array<unknown>) => void): void => {
        if (event === 'message') {
          raw.on(event, (data: unknown) => listener(String(data)));
        } else {
          raw.on(event, (...args: Array<unknown>) => listener(...args));
        }
      },
      removeAllListeners: (): void => raw.removeAllListeners(),
    };
  }

  private resubscribeAll(): void {
    if (!this.isConnected || this.socket === null) {
      return;
    }
    const addresses = [...this.watched.keys()];
    if (addresses.length === 0) {
      return;
    }
    this.send({ ...buildPriceSubscribe(addresses) });
    this.send({ ...buildTxsSubscribe(addresses) });
  }

  private send(payload: { readonly type: string; readonly data?: unknown }): void {
    try {
      this.socket?.send(JSON.stringify(payload));
    } catch {
      // A failed send surfaces via the socket close/error path.
    }
  }

  private routePush(raw: unknown): void {
    let push: { readonly type?: unknown; readonly data?: unknown };
    try {
      push = JSON.parse(String(raw)) as typeof push;
    } catch {
      return;
    }
    if (push.type === 'PRICE_DATA') {
      this.routePrice(push.data);
      return;
    }
    if (push.type === 'TXS_DATA') {
      this.routeTx(push.data);
      return;
    }
    // WELCOME / NEW_PAIR_DATA / unknown: discovery or handshake noise —
    // no broker event (pair discovery has no price leg in v1).
  }

  private routePrice(data: unknown): void {
    const candle = data as Record<string, unknown>;
    const address = typeof candle['address'] === 'string' ? (candle['address'] as string) : '';
    const held = this.watched.get(address);
    if (!held) {
      return;
    }
    const open = candle['o'];
    const high = candle['h'];
    const low = candle['l'];
    const close = candle['c'];
    const volume = candle['v'];
    if (
      typeof open !== 'number' ||
      typeof high !== 'number' ||
      typeof low !== 'number' ||
      typeof close !== 'number'
    ) {
      return;
    }
    const timestamp = BirdeyeWsAdapter.unixToIso(candle['unixTime']);
    if (held.ohlcv) {
      this.emit({
        kind: 'ohlcv',
        exchange: 'birdeye',
        symbol: address,
        timeframe: '1m',
        open,
        high,
        low,
        close,
        volume: typeof volume === 'number' ? volume : 0,
        timestamp,
      });
    }
    if (held.ticker) {
      this.emit({ kind: 'ticker', exchange: 'birdeye', symbol: address, price: close, timestamp });
    }
  }

  private routeTx(data: unknown): void {
    const tx = data as Record<string, unknown>;
    const address =
      typeof tx['address'] === 'string'
        ? (tx['address'] as string)
        : typeof tx['mint'] === 'string'
          ? (tx['mint'] as string)
          : '';
    const held = this.watched.get(address);
    if (!held?.ticker) {
      return;
    }
    const price = BirdeyeWsAdapter.firstNumber(tx, ['price', 'tokenPrice', 'priceUsd']);
    if (price === null) {
      return;
    }
    this.emit({
      kind: 'ticker',
      exchange: 'birdeye',
      symbol: address,
      price,
      timestamp: BirdeyeWsAdapter.unixToIso(tx['blockUnixTime'] ?? tx['unixTime']),
    });
  }

  private static firstNumber(source: Record<string, unknown>, keys: ReadonlyArray<string>): number | null {
    for (const key of keys) {
      if (typeof source[key] === 'number') {
        return source[key] as number;
      }
    }
    return null;
  }

  private static unixToIso(value: unknown): string {
    return typeof value === 'number' ? new Date(value * 1000).toISOString() : new Date().toISOString();
  }

  private emit(event: BirdeyeStreamEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private handleDown(message: string): void {
    if (!this.isConnected && this.socket === null) {
      return;
    }
    this.stopKeepalive();
    this.isConnected = false;
    const info: BirdeyeStreamError = { code: 'EXCHANGE_DOWN', message, exchange: 'birdeye' };
    for (const listener of this.errorListeners) {
      listener(info);
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.pingTimer = setInterval(() => {
      try {
        this.socket?.ping();
      } catch {
        // Missed pings surface via the socket close/error path.
      }
    }, this.pingIntervalMs);
    if (typeof this.pingTimer === 'object' && 'unref' in this.pingTimer) {
      (this.pingTimer as unknown as { unref(): void }).unref();
    }
  }

  private stopKeepalive(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
