import { Injectable } from '@nestjs/common';
import {
  EXCHANGE_ADAPTER_FACTORY,
  ExchangeWsPort,
  type ExchangeAdapterFactory,
} from 'stream/domain/exchange-ws.port';
import { Inject, Optional } from '@nestjs/common';
import { streamBackoffMs } from 'stream/domain/stream-policy';
import {
  streamKey,
  type StreamErrorInfo,
  type StreamEvent,
  type StreamSubscription,
} from 'stream/domain/stream-types';

export type StreamTickListener = (event: StreamEvent) => void;

export type StreamExchangeErrorListener = (exchange: string, info: StreamErrorInfo) => void;

export type StreamSleeper = (ms: number) => Promise<void>;

export const STREAM_SLEEPER = 'STREAM_SLEEPER';

interface ExchangeEntry {
  port: ExchangeWsPort;
  refs: Map<string, { sub: StreamSubscription; count: number }>;
  downAttempts: number;
  reconnecting: boolean;
}

const defaultSleeper: StreamSleeper = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exchange connection manager (Tramo 3, todo 11, P49 — stream application).
 *
 * Owns exactly ONE exchange connection per exchange (P49 invariant):
 * lazy-connects on the first subscriber, multiplexes every later
 * symbol over the same port, and closes the connection when the last
 * ref leaves. Exchange failure notifies subscribers with
 * EXCHANGE_DOWN + the retry delay, then reconnects with exponential
 * backoff (1s -> 30s ceiling) while refs remain — never a hot loop.
 */
@Injectable()
export class ExchangeConnectionManager {
  private readonly entries = new Map<string, ExchangeEntry>();

  private readonly tickListeners = new Set<StreamTickListener>();

  private readonly errorListeners = new Set<StreamExchangeErrorListener>();

  private readonly sleeper: StreamSleeper;

  public constructor(
    @Inject(EXCHANGE_ADAPTER_FACTORY) private readonly factory: ExchangeAdapterFactory,
    @Optional() @Inject(STREAM_SLEEPER) sleeper?: StreamSleeper,
  ) {
    this.sleeper = sleeper ?? defaultSleeper;
  }

  public onTick(listener: StreamTickListener): void {
    this.tickListeners.add(listener);
  }

  public onExchangeError(listener: StreamExchangeErrorListener): void {
    this.errorListeners.add(listener);
  }

  public async subscribe(sub: StreamSubscription): Promise<void> {
    const exchange = sub.exchange.toLowerCase();
    const entry = this.entryFor(exchange);
    if (!entry.port.connected) {
      await entry.port.connect();
    }
    const key = streamKey({ ...sub, exchange });
    const held = entry.refs.get(key);
    entry.refs.set(key, { sub: { ...sub, exchange }, count: (held?.count ?? 0) + 1 });
    await entry.port.watch([{ ...sub, exchange }]);
  }

  public async unsubscribe(sub: StreamSubscription): Promise<void> {
    const exchange = sub.exchange.toLowerCase();
    const entry = this.entries.get(exchange);
    if (!entry) {
      return;
    }
    const key = streamKey({ ...sub, exchange });
    const held = entry.refs.get(key);
    const remaining = (held?.count ?? 0) - 1;
    if (remaining > 0 && held) {
      entry.refs.set(key, { sub: held.sub, count: remaining });
      return;
    }
    entry.refs.delete(key);
    await entry.port.unwatch([{ ...sub, exchange }]);
    if (entry.refs.size === 0) {
      await entry.port.disconnect();
      this.entries.delete(exchange);
    }
  }

  public refCount(exchange: string): number {
    const entry = this.entries.get(exchange.toLowerCase());
    if (!entry) {
      return 0;
    }
    let total = 0;
    for (const held of entry.refs.values()) {
      total += held.count;
    }
    return total;
  }

  public connectionCount(): number {
    return this.entries.size;
  }

  public trackedSymbols(exchange: string): Array<string> {
    const entry = this.entries.get(exchange.toLowerCase());
    if (!entry) {
      return [];
    }
    const symbols = new Set<string>();
    for (const key of entry.refs.keys()) {
      symbols.add((key.split(':')[1] ?? '').toUpperCase());
    }
    return [...symbols].sort();
  }

  private entryFor(exchange: string): ExchangeEntry {
    const existing = this.entries.get(exchange);
    if (existing) {
      return existing;
    }
    const port = this.factory.create(exchange);
    const entry: ExchangeEntry = { port, refs: new Map(), downAttempts: 0, reconnecting: false };
    port.onEvent((event) => {
      for (const listener of this.tickListeners) {
        listener(event);
      }
    });
    port.onError((info) => {
      void this.handleExchangeError(exchange, info.message);
    });
    this.entries.set(exchange, entry);
    return entry;
  }

  private async handleExchangeError(exchange: string, message: string): Promise<void> {
    const entry = this.entries.get(exchange);
    if (!entry || entry.refs.size === 0) {
      return;
    }
    entry.downAttempts += 1;
    const retryAfterMs = streamBackoffMs(entry.downAttempts - 1);
    const info: StreamErrorInfo = {
      code: 'EXCHANGE_DOWN',
      message,
      exchange,
      retryAfterMs,
    };
    for (const listener of this.errorListeners) {
      listener(exchange, info);
    }
    if (entry.reconnecting) {
      return;
    }
    entry.reconnecting = true;
    try {
      await this.sleeper(retryAfterMs);
      if (entry.refs.size === 0) {
        return;
      }
      // Fresh handshake, then re-multiplex every surviving subscription:
      // adapters drop their watch-list on disconnect by contract.
      await entry.port.disconnect().catch(() => undefined);
      await entry.port.connect();
      const survived = [...entry.refs.values()].map((held) => held.sub);
      if (survived.length > 0) {
        await entry.port.watch(survived);
      }
      entry.downAttempts = 0;
    } catch (err: unknown) {
      await this.handleExchangeError(
        exchange,
        err instanceof Error ? err.message : 'reconnect failed',
      );
    } finally {
      entry.reconnecting = false;
    }
  }
}
