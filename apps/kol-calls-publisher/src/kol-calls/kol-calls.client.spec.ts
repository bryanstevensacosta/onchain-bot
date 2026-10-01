import { KolCallsClient } from './kol-calls.client';

describe('KolCallsClient contract', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.KOL_CALLS_API_KEY;
    delete process.env.KOL_CALLS_URL;
  });

  it('sends x-api-key and paginated query params on list calls', async () => {
    process.env.KOL_CALLS_URL = 'http://kol-calls:3050';
    process.env.KOL_CALLS_API_KEY = 'secret';
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    global.fetch = (async (
      url: unknown,
      init?: { headers?: Record<string, string> },
    ) => {
      calls.push({ url: String(url), headers: init?.headers ?? {} });
      return {
        ok: true,
        json: async () => ({ items: [], total: 0, limit: 50, offset: 0 }),
      };
    }) as typeof fetch;
    const client = new KolCallsClient();
    await client.listMentions(25, 50);
    await client.listSnapshots(10, 5);
    expect(calls[0].url).toBe(
      'http://kol-calls:3050/api/mentions?limit=25&offset=50',
    );
    expect(calls[0].headers['x-api-key']).toBe('secret');
    expect(calls[1].url).toBe(
      'http://kol-calls:3050/api/snapshots?limit=10&offset=5',
    );
  });

  it('throws on non-ok upstream (broken contract surfaces, never silent null)', async () => {
    global.fetch = (async () => ({ ok: false, status: 401 })) as typeof fetch;
    const client = new KolCallsClient();
    await expect(client.listMentions()).rejects.toThrow('401');
  });
});
