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

function mockFetchCaptureHeaders(): {
  headers: Array<Record<string, string>>;
} {
  const headers: Array<Record<string, string>> = [];
  (global as { fetch?: unknown }).fetch = async (
    _url: unknown,
    init?: { headers?: Record<string, string> },
  ) => {
    headers.push(init?.headers ?? {});
    return { ok: true, status: 200, json: async () => [] };
  };
  return { headers };
}

describe('IngestionHttpClientAdapter', () => {
  it('lists sources through ?type=crypto-news', async () => {
    const seen = mockFetchOnce({ sources: [] });
    const adapter = new IngestionHttpClientAdapter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { get: () => undefined } as any,
    );
    await adapter.listFeedSources();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('/api/feed/sources?type=crypto-news');
  });

  it('fetches recent messages through ?type=crypto-news', async () => {
    const seen = mockFetchOnce({ messages: [] });
    const adapter = new IngestionHttpClientAdapter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { get: () => 'http://localhost:3031/' } as any,
    );
    await adapter.fetchRecentFeedMessages(10);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('/api/feed/messages');
    expect(seen[0]).toContain('type=crypto-news');
  });

  it('sends x-api-key from day one (P30)', async () => {
    const { headers } = mockFetchCaptureHeaders();
    const adapter = new IngestionHttpClientAdapter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { get: (key: string) => (key === 'INGESTION_TELEGRAM_API_KEY' ? 's3cret' : undefined) } as any,
    );
    await adapter.listFeedSources();
    expect(headers).toHaveLength(1);
    expect(headers[0]['x-api-key']).toBe('s3cret');
  });

  it('degrades to [] on transport errors', async () => {
    const seen = mockFetchOnce(null, false);
    const adapter = new IngestionHttpClientAdapter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { get: () => undefined } as any,
    );
    await expect(adapter.listFeedSources()).resolves.toEqual([]);
    await expect(
      adapter.fetchRecentFeedMessages(10),
    ).resolves.toEqual([]);
    expect(seen).toHaveLength(2);
  });

  it('trims a trailing slash from the base URL', async () => {
    const seen = mockFetchOnce({ sources: [] });
    const adapter = new IngestionHttpClientAdapter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { get: () => 'http://localhost:3031/' } as any,
    );
    await adapter.listFeedSources();
    expect(seen[0]).not.toContain(':3031//api');
  });
});
