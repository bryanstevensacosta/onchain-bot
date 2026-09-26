import { MigrateBotsToGatewayUseCase } from './migrate-bots-to-gateway.use-case';
import { GatewayBotMappingService } from '../../infrastructure/gateway/gateway-bot-mapping.service';
import { GatewayHmacSigner } from '../../infrastructure/gateway/gateway-hmac-signer.service';

function mockFetchOnce(payload: unknown, ok = true, status = 200): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function makeUseCase(botToken: string, mapping?: GatewayBotMappingService) {
  const botConfig = {
    get: () => ({
      botToken,
      botsGatewayBaseUrl: 'http://gateway:4070',
    }),
  };
  return new MigrateBotsToGatewayUseCase(
    botConfig as never,
    new GatewayHmacSigner(),
    mapping ?? new GatewayBotMappingService(),
  );
}

describe('MigrateBotsToGatewayUseCase (dexter gateway todo 6)', () => {
  const OLD_FETCH = global.fetch;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = OLD_FETCH;
  });

  it('registers the env token into the gateway vault and maps dexter', async () => {
    const fetchMock = mockFetchOnce({ id: 'vault-9' });
    const mapping = new GatewayBotMappingService();
    const out = await makeUseCase('999:FAKE', mapping).execute();
    expect(out.failed).toEqual([]);
    expect(out.migrated).toEqual([
      { localId: 'dexter', gatewayId: 'vault-9', label: 'dexter' },
    ]);
    expect(mapping.resolveGatewayId('dexter')).toBe('vault-9');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gateway:4070/api/vault/bots');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      label: 'dexter',
      ownerApp: 'dexter-onchain-bot',
    });
  });

  it('fails per-bot when no token is configured (no gateway call)', async () => {
    const fetchMock = mockFetchOnce({ id: 'vault-9' });
    const out = await makeUseCase('').execute();
    expect(out.migrated).toEqual([]);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0].localId).toBe('dexter');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips already-mapped bots (no duplicate vault entries)', async () => {
    const fetchMock = mockFetchOnce({ id: 'vault-9' });
    const mapping = new GatewayBotMappingService();
    mapping.register('dexter', 'vault-9');
    const out = await makeUseCase('999:FAKE', mapping).execute();
    expect(out).toEqual({ migrated: [], failed: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records gateway failures without throwing', async () => {
    mockFetchOnce({ message: 'Forbidden' }, false, 403);
    const out = await makeUseCase('999:FAKE').execute();
    expect(out.migrated).toEqual([]);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0].reason).toMatch(/Forbidden/);
  });
});
