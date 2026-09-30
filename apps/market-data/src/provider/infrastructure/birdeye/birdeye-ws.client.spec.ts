import { BirdeyeWsAdapter } from './birdeye-ws.client';
import type { BirdeyeSocket } from './birdeye-ws.client';

/**
 * Failing-first spec (Birdeye WS realtime): the adapter must speak the
 * documented Birdeye WS protocol verbatim over
 * `wss://public-api.birdeye.so/socket/solana` (echo-protocol), route
 * pushes into broker-shaped stream events, and surface disconnects as
 * EXCHANGE_DOWN (backoff + reconnect owned by ExchangeConnectionManager)
 * with full resubscribe on the next connect.
 *
 * @see https://docs.birdeye.so/docs/websocket
 */
describe('BirdeyeWsAdapter (Birdeye WS realtime)', () => {
  const MINT = 'So11111111111111111111111111111111111111112';

  interface MockSocket extends BirdeyeSocket {
    sent: Array<string>;
    handlers: Map<string, Array<(...args: Array<unknown>) => void>>;
    emitLocal(event: string, ...args: Array<unknown>): void;
  }

  function createMockSocket(): MockSocket {
    const handlers = new Map<string, Array<(...args: Array<unknown>) => void>>();
    const socket: MockSocket = {
      sent: [],
      handlers,
      send: (data: string): void => {
        socket.sent.push(data);
      },
      ping: (): void => undefined,
      pong: (): void => undefined,
      close: (): void => undefined,
      on: (event: string, listener: (...args: Array<unknown>) => void): void => {
        const held = handlers.get(event) ?? [];
        held.push(listener);
        handlers.set(event, held);
      },
      removeAllListeners: (): void => {
        handlers.clear();
      },
      emitLocal: (event: string, ...args: Array<unknown>): void => {
        for (const listener of handlers.get(event) ?? []) {
          listener(...args);
        }
      },
    };
    return socket;
  }

  function createAdapter(): { adapter: BirdeyeWsAdapter; sockets: Array<MockSocket> } {
    const sockets: Array<MockSocket> = [];
    const adapter = new BirdeyeWsAdapter('test-key', {
      socketFactory: () => {
        const socket = createMockSocket();
        sockets.push(socket);
        return socket;
      },
    });
    return { adapter, sockets };
  }

  function openFirst(sockets: Array<MockSocket>): MockSocket {
    const socket = sockets[0];
    socket.emitLocal('open');
    return socket;
  }

  it('opens the solana socket with echo-protocol and sends the verbatim subscribes', async () => {
    const opened: Array<{ url: string; protocols: string }> = [];
    const sockets: Array<MockSocket> = [];
    const adapter = new BirdeyeWsAdapter('test-key', {
      socketFactory: (url: string, protocols: string) => {
        opened.push({ url, protocols });
        const socket = createMockSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const pending = adapter.connect();
    openFirst(sockets);
    await pending;
    expect(opened).toHaveLength(1);
    expect(opened[0].url).toBe('wss://public-api.birdeye.so/socket/solana?x-api-key=test-key');
    expect(opened[0].protocols).toBe('echo-protocol');

    await adapter.watch([{ exchange: 'birdeye', symbol: MINT, kind: 'ticker' }]);
    expect(sockets[0].sent.map((raw) => JSON.parse(raw))).toEqual([
      { type: 'SUBSCRIBE_NEW_PAIR' },
      {
        type: 'SUBSCRIBE_PRICE',
        data: {
          queryType: 'complex',
          query: `(address = ${MINT} AND chartType = 1m AND currency = usd)`,
        },
      },
      { type: 'SUBSCRIBE_TXS', data: { queryType: 'complex', query: `address = ${MINT}`, txsType: 'all' } },
    ]);
    await adapter.disconnect();
  });

  it('routes PRICE_DATA to a broker-shaped ticker event (price = close)', async () => {
    const { adapter, sockets } = createAdapter();
    const events: Array<unknown> = [];
    adapter.onEvent((event) => events.push(event));
    const pending = adapter.connect();
    const socket = openFirst(sockets);
    await pending;
    await adapter.watch([{ exchange: 'birdeye', symbol: MINT, kind: 'ticker' }]);
    socket.emitLocal(
      'message',
      JSON.stringify({
        type: 'PRICE_DATA',
        data: {
          o: 24.5,
          h: 24.6,
          l: 24.4,
          c: 24.46,
          v: 69.4,
          type: '1m',
          unixTime: 1675506240,
          symbol: 'SOL',
          address: MINT,
        },
      }),
    );
    expect(events).toEqual([
      {
        kind: 'ticker',
        exchange: 'birdeye',
        symbol: MINT,
        price: 24.46,
        timestamp: new Date(1675506240 * 1000).toISOString(),
      },
    ]);
    await adapter.disconnect();
  });

  it('routes PRICE_DATA to a broker-shaped ohlcv event for ohlcv subs', async () => {
    const { adapter, sockets } = createAdapter();
    const events: Array<unknown> = [];
    adapter.onEvent((event) => events.push(event));
    const pending = adapter.connect();
    const socket = openFirst(sockets);
    await pending;
    await adapter.watch([{ exchange: 'birdeye', symbol: MINT, kind: 'ohlcv', timeframe: '1m' }]);
    socket.emitLocal(
      'message',
      JSON.stringify({
        type: 'PRICE_DATA',
        data: {
          o: 24.5,
          h: 24.6,
          l: 24.4,
          c: 24.46,
          v: 69.4,
          type: '1m',
          unixTime: 1675506240,
          symbol: 'SOL',
          address: MINT,
        },
      }),
    );
    expect(events).toEqual([
      {
        kind: 'ohlcv',
        exchange: 'birdeye',
        symbol: MINT,
        timeframe: '1m',
        open: 24.5,
        high: 24.6,
        low: 24.4,
        close: 24.46,
        volume: 69.4,
        timestamp: new Date(1675506240 * 1000).toISOString(),
      },
    ]);
    await adapter.disconnect();
  });

  it('refuses to connect without an API key (loud, never a silent dark feed)', async () => {
    const { adapter } = createAdapter();
    const keyless = new BirdeyeWsAdapter('', {
      socketFactory: () => createMockSocket(),
    });
    await expect(keyless.connect()).rejects.toThrow('BIRDEYE_API_KEY');
    expect(adapter.connected).toBe(false);
  });

  it('surfaces a server close as EXCHANGE_DOWN and resubscribes on reconnect', async () => {
    const { adapter, sockets } = createAdapter();
    const errors: Array<unknown> = [];
    adapter.onError((info) => errors.push(info));
    const firstPending = adapter.connect();
    const first = openFirst(sockets);
    await firstPending;
    await adapter.watch([{ exchange: 'birdeye', symbol: MINT, kind: 'ticker' }]);
    const sentBefore = first.sent.length;
    expect(sentBefore).toBeGreaterThan(0);

    first.emitLocal('close');
    expect(adapter.connected).toBe(false);
    expect(errors).toEqual([
      { code: 'EXCHANGE_DOWN', message: expect.any(String), exchange: 'birdeye' },
    ]);

    const secondPending = adapter.connect();
    const second = openFirst(sockets.slice(1));
    await secondPending;
    expect(second.sent.length).toBe(sentBefore);
    expect(second.sent).toEqual(first.sent);
    await adapter.disconnect();
  });

  it('ignores WELCOME and unknown pushes without emitting', async () => {
    const { adapter, sockets } = createAdapter();
    const events: Array<unknown> = [];
    adapter.onEvent((event) => events.push(event));
    const pending = adapter.connect();
    const socket = openFirst(sockets);
    await pending;
    socket.emitLocal('message', JSON.stringify({ type: 'WELCOME' }));
    socket.emitLocal('message', JSON.stringify({ type: 'SOMETHING_NEW', data: {} }));
    socket.emitLocal('message', 'not-json{{{');
    expect(events).toEqual([]);
    await adapter.disconnect();
  });
});
