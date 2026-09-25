import { InMemoryExchangeAdapter } from './in-memory-exchange.adapter';
import type { StreamEvent } from 'stream/domain/stream-types';

/**
 * Failing-first spec (Tramo 3, todo 11, P49): in-memory exchange port.
 *
 * Stands in for the ccxt.pro adapter (same ExchangeWsPort contract:
 * ONE connection per exchange, multiplexed watch/unwatch). The real
 * ccxt adapter is driver-gated (needs keys + network); this one keeps
 * unit + live transport tests deterministic.
 */
describe('InMemoryExchangeAdapter', () => {
  it('connects once and multiplexes symbols over that single connection', async () => {
    const adapter = new InMemoryExchangeAdapter('binance');
    await adapter.connect();
    await adapter.connect();
    expect(adapter.connectCount).toBe(1);
    expect(adapter.connected).toBe(true);
    await adapter.watch([{ exchange: 'binance', symbol: 'BTC/USDT', kind: 'ticker' }]);
    await adapter.watch([{ exchange: 'binance', symbol: 'ETH/USDT', kind: 'ticker' }]);
    expect(adapter.watchedSymbols()).toEqual(['BTC/USDT', 'ETH/USDT']);
    expect(adapter.connectCount).toBe(1);
    await adapter.disconnect();
  });

  it('emits ticks for watched symbols only', async () => {
    const adapter = new InMemoryExchangeAdapter('kraken');
    const seen: Array<StreamEvent> = [];
    adapter.onEvent((event) => seen.push(event));
    await adapter.connect();
    await adapter.watch([{ exchange: 'kraken', symbol: 'SOL/USDT', kind: 'ticker' }]);
    adapter.pump();
    adapter.pump();
    expect(seen.length).toBe(2);
    expect(seen[0]).toMatchObject({ kind: 'ticker', exchange: 'kraken', symbol: 'SOL/USDT' });
    await adapter.unwatch([{ exchange: 'kraken', symbol: 'SOL/USDT', kind: 'ticker' }]);
    adapter.pump();
    expect(seen.length).toBe(2);
    await adapter.disconnect();
  });

  it('surfaces exchange failures through onError (adversarial: exchange down)', async () => {
    const adapter = new InMemoryExchangeAdapter('coinbase');
    const errors: Array<{ message: string }> = [];
    adapter.onError((info) => errors.push(info));
    await adapter.connect();
    adapter.simulateDown('boom');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('boom');
    await adapter.disconnect();
  });
});
