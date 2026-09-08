import { ConfigService } from '@nestjs/config';
import { CryptoNewsIngestionClient } from './crypto-news-ingestion-client.service';

/**
 * Regression tests for F3 blocking finding #1 (fetch-wrapper mismatch).
 *
 * Ingestion `GET /api/crypto-news/messages` returns a WRAPPED payload
 * `{timestamp, count, data}` (ETag-busting wrapper, commit 97199b2) while
 * `GET /messages/channel/:channelId` and `GET /sources` return BARE arrays.
 * The client must unwrap defensively: array `data` → use it; bare array →
 * use it; anything else → [].
 */
describe('CryptoNewsIngestionClient (wrapper regression)', () => {
  const mockFetch = jest.fn();
  let client: CryptoNewsIngestionClient;

  const rawMessage = {
    id: 'msg-1',
    channelId: '-1009998887001',
    messageId: 7001,
    title: null,
    content: 'F3PROBE chrono: F3PROBEALPHA breaks out on testnet',
    publishedAt: new Date().toISOString(),
    ingestedAt: new Date().toISOString(),
    linkPreviewUrl: null,
    linkPreviewTitle: null,
    linkPreviewDescription: null,
    linkPreviewSiteName: null,
    messageEntities: null,
    groupedId: null,
    media: [],
  };

  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });

  beforeAll(() => {
    global.fetch = mockFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const config = {
      get: jest.fn((key: string) =>
        key === 'app'
          ? { ingestion: { serviceUrl: 'http://localhost:3031' } }
          : undefined,
      ),
    } as unknown as ConfigService;
    client = new CryptoNewsIngestionClient(config);
  });

  it('fetchRecentMessages unwraps the {timestamp,count,data} wrapper', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        timestamp: new Date().toISOString(),
        count: 1,
        data: [rawMessage],
      }),
    );

    const messages = await client.fetchRecentMessages(50);

    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe(7001);
  });

  it('fetchRecentMessages still accepts a bare array (backward compat)', async () => {
    mockFetch.mockResolvedValue(okResponse([rawMessage]));

    const messages = await client.fetchRecentMessages(50);

    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe(7001);
  });

  it('fetchRecentMessages returns [] on unexpected shapes (never throws)', async () => {
    mockFetch.mockResolvedValue(okResponse({ timestamp: 'x', count: 0 }));

    const messages = await client.fetchRecentMessages(50);

    expect(messages).toEqual([]);
  });

  it('fetchMessagesByChannel accepts bare array AND wrapped shape', async () => {
    mockFetch.mockResolvedValue(okResponse([rawMessage]));
    const bare = await client.fetchMessagesByChannel('-1009998887001');
    expect(bare).toHaveLength(1);

    mockFetch.mockResolvedValue(
      okResponse({
        timestamp: new Date().toISOString(),
        count: 1,
        data: [rawMessage],
      }),
    );
    const wrapped = await client.fetchMessagesByChannel('-1009998887001');
    expect(wrapped).toHaveLength(1);
  });

  it('fetchSources accepts bare array AND wrapped shape', async () => {
    const source = {
      channelId: '-1009998887001',
      handle: 'f3probe',
      title: 'F3 Probe Source',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockFetch.mockResolvedValue(okResponse([source]));
    const bare = await client.fetchSources();
    expect(bare).toHaveLength(1);

    mockFetch.mockResolvedValue(
      okResponse({
        timestamp: new Date().toISOString(),
        count: 1,
        data: [source],
      }),
    );
    const wrapped = await client.fetchSources();
    expect(wrapped).toHaveLength(1);
  });
});
