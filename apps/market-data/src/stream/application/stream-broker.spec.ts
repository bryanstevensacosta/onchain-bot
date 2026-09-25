import { HttpStatus } from '@nestjs/common';
import { StreamBrokerService } from './stream-broker.service';
import { ExchangeConnectionManager } from './exchange-connection-manager.service';
import { RateLimiterService } from 'rate-limiter/application/rate-limiter.service';
import { ApiKeyService } from 'auth/application/api-key.service';
import { InMemoryExchangeAdapter } from 'stream/infrastructure/in-memory-exchange.adapter';
import { buildGatewayClientKey } from 'gateway/domain/gateway-policy';
import { GATEWAY_LIMIT_PER_MINUTE, GATEWAY_WINDOW_MS } from 'gateway/domain/gateway-policy';
import type { StreamClientMessage } from 'stream/domain/stream-types';

/**
 * Failing-first spec (Tramo 3, todo 11, P49): stream broker.
 *
 * Auth (P46) + per-client subscriptions + backpressure + shared
 * rate-limit with REST + cleanup on disconnect (no leaks).
 */
describe('StreamBrokerService', () => {
  async function setup(): Promise<{
    broker: StreamBrokerService;
    keys: ApiKeyService;
    limiter: RateLimiterService;
    manager: ExchangeConnectionManager;
    adapters: Array<InMemoryExchangeAdapter>;
  }> {
    const keys = new ApiKeyService();
    const limiter = new RateLimiterService();
    const adapters: Array<InMemoryExchangeAdapter> = [];
    const manager = new ExchangeConnectionManager(
      {
        create: (exchange: string) => {
          const adapter = new InMemoryExchangeAdapter(exchange);
          adapters.push(adapter);
          return adapter;
        },
      },
      () => Promise.resolve(),
    );
    const broker = new StreamBrokerService(keys, limiter, manager);
    return { broker, keys, limiter, manager, adapters };
  }

  it('rejects unknown clients and keyless connects with 401 (auth required)', async () => {
    const { broker, keys } = await setup();
    await keys.create({ name: 'seed', scopes: ['read'] });
    await expect(broker.connect('c1', undefined, '9.9.9.9')).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
    await expect(broker.connect('c1', 'md_wrong', '9.9.9.9')).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
    await expect(
      broker.subscribe('ghost', { exchange: 'binance', symbol: 'BTC/USDT', kind: 'ticker' }),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
  });

  it('rejects ohlcv on a read-scoped key with 403 (scope hierarchy)', async () => {
    const { broker, keys } = await setup();
    const { plaintext } = await keys.create({ name: 'r', scopes: ['read'] });
    await broker.connect('c1', plaintext, '9.9.9.9');
    await expect(
      broker.subscribe('c1', { exchange: 'binance', symbol: 'BTC/USDT', kind: 'ohlcv' }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('routes subscribe -> tick -> unsubscribe over one shared connection', async () => {
    const { broker, keys, adapters } = await setup();
    const { plaintext } = await keys.create({ name: 'r', scopes: ['snapshot'] });
    await broker.connect('c1', plaintext, '9.9.9.9');
    const received: Array<StreamClientMessage> = [];
    broker.registerEmitter('c1', (message) => received.push(message));
    await broker.subscribe('c1', { exchange: 'binance', symbol: 'BTC/USDT', kind: 'ticker' });
    expect(adapters.length).toBe(1);
    expect(broker.subscriptionCount('c1')).toBe(1);
    adapters[0].pump();
    expect(received.length).toBe(1);
    expect(received[0]).toMatchObject({ kind: 'ticker', symbol: 'BTC/USDT' });
    await broker.unsubscribe('c1', { exchange: 'binance', symbol: 'BTC/USDT', kind: 'ticker' });
    expect(broker.subscriptionCount('c1')).toBe(0);
    adapters[0].pump();
    expect(received.length).toBe(1);
  });

  it('applies backpressure: drops oldest, counts drops, keeps newest', async () => {
    const { broker, keys, adapters } = await setup();
    const { plaintext } = await keys.create({ name: 'r', scopes: ['read'] });
    await broker.connect('slow', plaintext, '9.9.9.9');
    await broker.subscribe('slow', { exchange: 'binance', symbol: 'BTC/USDT', kind: 'ticker' });
    for (let i = 0; i < 200; i += 1) {
      adapters[0].pump();
    }
    expect(broker.droppedCount('slow')).toBeGreaterThan(0);
    const drained = broker.pending('slow');
    expect(drained.length).toBeLessThanOrEqual(128);
    expect(broker.pending('slow').length).toBe(0);
  });

  it('shares the rate budget with REST: an exhausted gw window rejects subscribes', async () => {
    const { broker, keys, limiter } = await setup();
    const { plaintext } = await keys.create({ name: 'r', scopes: ['read'] });
    const ip = '10.0.0.7';
    await broker.connect('c1', plaintext, ip);
    const key = buildGatewayClientKey(ip);
    for (let i = 0; i < GATEWAY_LIMIT_PER_MINUTE; i += 1) {
      expect(limiter.tryAcquire(key, GATEWAY_LIMIT_PER_MINUTE, GATEWAY_WINDOW_MS)).toBe(true);
    }
    await expect(
      broker.subscribe('c1', { exchange: 'binance', symbol: 'BTC/USDT', kind: 'ticker' }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('cleans every subscription on disconnect (no leaks)', async () => {
    const { broker, keys, manager } = await setup();
    const { plaintext } = await keys.create({ name: 'r', scopes: ['read'] });
    await broker.connect('c1', plaintext, '9.9.9.9');
    await broker.subscribe('c1', { exchange: 'binance', symbol: 'BTC/USDT', kind: 'ticker' });
    await broker.subscribe('c1', { exchange: 'kraken', symbol: 'ETH/USDT', kind: 'ticker' });
    expect(broker.subscriptionCount()).toBe(2);
    await broker.disconnect('c1');
    expect(broker.subscriptionCount()).toBe(0);
    expect(broker.subscriptionCount('c1')).toBe(0);
    expect(manager.connectionCount()).toBe(0);
    expect(broker.isConnected('c1')).toBe(false);
  });

  it('caps a client at 100 subscriptions', async () => {
    const { broker, keys } = await setup();
    const { plaintext } = await keys.create({ name: 'r', scopes: ['read'] });
    await broker.connect('c1', plaintext, '9.9.9.9');
    // Advance the clock 2s per subscribe: the shared 60/min sliding
    // window never fills, isolating the 100-sub client cap.
    let now = 1_000_000;
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => {
      now += 2000;
      return now;
    });
    try {
      for (let i = 0; i < 100; i += 1) {
        await broker.subscribe('c1', {
          exchange: 'binance',
          symbol: `SYM${i}/USDT`,
          kind: 'ticker',
        });
      }
      await expect(
        broker.subscribe('c1', { exchange: 'binance', symbol: 'OVER/USDT', kind: 'ticker' }),
      ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    } finally {
      spy.mockRestore();
    }
  });
});
