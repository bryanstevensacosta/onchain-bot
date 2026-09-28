import { DexterBotBindingService } from '@/telegram/application/dexter-bot-binding.service';
import { GatewayBotMappingService } from '@/telegram/infrastructure/gateway/gateway-bot-mapping.service';

function mockFetchOnce(payload: unknown, ok = true, status = 200): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function makeService() {
  const botConfig = {
    get: () => ({ botsGatewayBaseUrl: 'http://gateway:4070' }),
  };
  const signer = { authHeaders: () => ({}) };
  const mapping = new GatewayBotMappingService();
  const service = new DexterBotBindingService(
    botConfig as never,
    signer as never,
    mapping,
  );
  return { service, mapping };
}

describe('DexterBotBindingService (bind from gateway inventory)', () => {
  const OLD_FETCH = global.fetch;
  afterAll(() => {
    global.fetch = OLD_FETCH;
  });

  it('binds an inventory bot to dexter and records the local mapping', async () => {
    mockFetchOnce({ id: 'vault-1', boundApp: 'dexter-onchain-bot' });
    const { service, mapping } = makeService();
    const out = await service.bindFromInventory('vault-1');
    expect(out.ok).toBe(true);
    expect(mapping.resolveGatewayId('dexter')).toBe('vault-1');
  });

  it('lists gateway inventory with availability', async () => {
    const fetchMock = mockFetchOnce([
      { id: 'vault-1', boundApp: 'dexter-onchain-bot', available: false },
      { id: 'vault-2', boundApp: null, available: true },
    ]);
    const { service } = makeService();
    const rows = await service.inventory();
    expect(rows).toHaveLength(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/bots/inventory');
  });
});
