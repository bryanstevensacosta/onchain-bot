import { ExchangeConnectionManager } from './exchange-connection-manager.service';
import { InMemoryExchangeAdapter } from 'stream/infrastructure/in-memory-exchange.adapter';
import type {
  ExchangeAdapterFactory,
  ExchangeWsPort,
} from 'stream/domain/exchange-ws.port';
import type { StreamErrorInfo, StreamEvent } from 'stream/domain/stream-types';

/**
 * Failing-first spec (Tramo 3, todo 11, P49): single WS connection
 * per exchange, multiplexed across subscribers, with backoff on
 * exchange failure.
 */
describe('ExchangeConnectionManager', () => {
  function setup(sleeper?: (ms: number) => Promise<void>): {
    manager: ExchangeConnectionManager;
    created: Array<InMemoryExchangeAdapter>;
  } {
    const created: Array<InMemoryExchangeAdapter> = [];
    const factory: ExchangeAdapterFactory = {
      create(exchange: string): ExchangeWsPort {
        const adapter = new InMemoryExchangeAdapter(exchange);
        created.push(adapter);
        return adapter;
      },
    };
    const manager = new ExchangeConnectionManager(
      factory,
      sleeper ?? (() => Promise.resolve()),
    );
    return { manager, created };
  }

  it('shares ONE connection per exchange across subscribers (P49)', async () => {
    const { manager, created } = setup();
    await manager.subscribe({ exchange: 'binance', symbol: 'BTC/USDT', kind: 'ticker' });
    await manager.subscribe({ exchange: 'binance', symbol: 'ETH/USDT', kind: 'ticker' });
    await manager.subscribe({ exchange: 'kraken', symbol: 'BTC/USDT', kind: 'ticker' });
    expect(created.length).toBe(2);
    expect(manager.connectionCount()).toBe(2);
    expect(manager.refCount('binance')).toBe(2);
    expect(manager.trackedSymbols('binance')).toEqual(['BTC/USDT', 'ETH/USDT']);
  });

  it('releases symbols and closes the connection when the last ref leaves (no leaks)', async () => {
    const { manager } = setup();
    const sub = { exchange: 'binance', symbol: 'BTC/USDT', kind: 'ticker' as const };
    await manager.subscribe(sub);
    await manager.subscribe(sub);
    expect(manager.refCount('binance')).toBe(2);
    await manager.unsubscribe(sub);
    expect(manager.refCount('binance')).toBe(1);
    expect(manager.connectionCount()).toBe(1);
    await manager.unsubscribe(sub);
    expect(manager.refCount('binance')).toBe(0);
    expect(manager.connectionCount()).toBe(0);
  });

  it('fans ticks out to every subscriber of the symbol', async () => {
    const { manager, created } = setup();
    const seen: Array<StreamEvent> = [];
    manager.onTick((event) => seen.push(event));
    await manager.subscribe({ exchange: 'binance', symbol: 'BTC/USDT', kind: 'ticker' });
    created[0].pump();
    expect(seen.length).toBe(1);
    expect(seen[0]).toMatchObject({ exchange: 'binance', symbol: 'BTC/USDT' });
  });

  it('notifies subscribers with EXCHANGE_DOWN and reconnects with backoff (adversarial)', async () => {
    const slept: Array<number> = [];
    const { manager, created } = setup((ms) => {
      slept.push(ms);
      return Promise.resolve();
    });
    const errors: Array<{ exchange: string; info: StreamErrorInfo }> = [];
    manager.onExchangeError((exchange, info) => errors.push({ exchange, info }));
    await manager.subscribe({ exchange: 'binance', symbol: 'BTC/USDT', kind: 'ticker' });
    created[0].simulateDown('exchange exploded');
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(errors.length).toBe(1);
    expect(errors[0].exchange).toBe('binance');
    expect(errors[0].info.code).toBe('EXCHANGE_DOWN');
    expect(errors[0].info.retryAfterMs).toBeGreaterThan(0);
    expect(slept).toEqual([errors[0].info.retryAfterMs]);
    expect(created[0].connectCount).toBeGreaterThanOrEqual(2);
  });
});
