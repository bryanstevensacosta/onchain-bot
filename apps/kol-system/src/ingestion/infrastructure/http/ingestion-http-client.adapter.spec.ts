import { IngestionHttpClientAdapter } from './ingestion-http-client.adapter';

function mockFetchOnce(payload: unknown, ok = true): string[] {
  const seen: string[] = [];
  (global as { fetch?: unknown }).fetch = async (url: unknown) => {
    seen.push(String(url));
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => payload,
    };
  };
  return seen;
}

describe('IngestionHttpClientAdapter', () => {
  it('lists sources through ?type=kol', async () => {
    const seen = mockFetchOnce({ sources: [] });
    const adapter = new IngestionHttpClientAdapter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { get: () => undefined } as any,
    );
    await adapter.listKolSources();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('/api/feed/sources?type=kol');
  });

  it('fetches recent messages through ?type=kol', async () => {
    const seen = mockFetchOnce({ messages: [] });
    const adapter = new IngestionHttpClientAdapter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { get: () => 'http://localhost:3031/' } as any,
    );
    await adapter.fetchRecentKolMessages(10);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('/api/feed/messages');
    expect(seen[0]).toContain('type=kol');
  });

  it('trims a trailing slash from the base URL', async () => {
    const seen = mockFetchOnce({ sources: [] });
    const adapter = new IngestionHttpClientAdapter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { get: () => 'http://localhost:3031/' } as any,
    );
    await adapter.listKolSources();
    expect(seen[0]).not.toContain(':3031//api');
  });
});
