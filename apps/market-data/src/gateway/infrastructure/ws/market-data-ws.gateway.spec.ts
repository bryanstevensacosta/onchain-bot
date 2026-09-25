import { MarketDataWsGateway } from './market-data-ws.gateway';
import type { StreamBrokerService } from 'stream/application/stream-broker.service';

interface FakeSocket {
  id: string;
  handshake: { auth?: { token?: string }; headers: Record<string, string | undefined> };
  emitted: Array<{ event: string; payload: unknown }>;
  disconnected: boolean;
  emit(event: string, payload: unknown): void;
  disconnect(): void;
}

function socket(id: string, token?: string): FakeSocket {
  const fake: FakeSocket = {
    id,
    handshake: { auth: token ? { token } : {}, headers: {} },
    emitted: [],
    disconnected: false,
    emit(event: string, payload: unknown): void {
      fake.emitted.push({ event, payload });
    },
    disconnect(): void {
      fake.disconnected = true;
    },
  };
  return fake;
}

/**
 * Failing-first spec (Tramo 3, todo 11, P49): Socket.IO transport.
 *
 * Transport decision (justified in AGENTS.md P49): Socket.IO via
 * @nestjs/websockets — zero new deps (already hoisted for the
 * backend WsGateway), same stack the frontend already speaks, rooms
 * map 1:1 to per-client subscriptions. Native `ws` would add a
 * second protocol for dashboard clients.
 */
describe('MarketDataWsGateway', () => {
  function setup(): { gateway: MarketDataWsGateway; broker: jest.Mocked<StreamBrokerService> } {
    const broker = {
      connect: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      disconnect: jest.fn(),
      registerEmitter: jest.fn(),
    } as unknown as jest.Mocked<StreamBrokerService>;
    const gateway = new MarketDataWsGateway(broker);
    return { gateway, broker };
  }

  it('rejects keyless handshakes with UNAUTHORIZED and disconnects', async () => {
    const { gateway, broker } = setup();
    broker.connect.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 401 }));
    const client = socket('c1');
    await gateway.handleConnection(client as never);
    expect(broker.connect).toHaveBeenCalledWith('c1', undefined, undefined);
    expect(client.emitted[0]).toMatchObject({ event: 'stream-error' });
    expect((client.emitted[0].payload as { code: string }).code).toBe('UNAUTHORIZED');
    expect(client.disconnected).toBe(true);
  });

  it('routes subscribe/unsubscribe and forwards broker payloads', async () => {
    const { gateway, broker } = setup();
    broker.connect.mockResolvedValueOnce({ keyId: 'k', keyName: 'n', scopes: ['read'] } as never);
    broker.subscribe.mockResolvedValueOnce({ subscribed: 'binance:btc/usdt:ticker' } as never);
    broker.unsubscribe.mockResolvedValueOnce({ unsubscribed: 'binance:btc/usdt:ticker' } as never);
    const client = socket('c1', 'md_key');
    await gateway.handleConnection(client as never);
    expect(broker.registerEmitter).toHaveBeenCalledWith('c1', expect.any(Function));
    const ack = await gateway.onSubscribe(client as never, {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      kind: 'ticker',
    });
    expect(broker.subscribe).toHaveBeenCalledWith('c1', {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      kind: 'ticker',
    });
    expect(ack).toMatchObject({ subscribed: 'binance:btc/usdt:ticker' });
    await gateway.onUnsubscribe(client as never, {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      kind: 'ticker',
    });
    expect(broker.unsubscribe).toHaveBeenCalled();
  });

  it('cleans broker state on socket disconnect (no leaks)', () => {
    const { gateway, broker } = setup();
    const client = socket('c1', 'md_key');
    gateway.handleDisconnect(client as never);
    expect(broker.disconnect).toHaveBeenCalledWith('c1');
  });
});
