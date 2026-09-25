import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api/http-client', () => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPatch: vi.fn(),
  httpPut: vi.fn(),
  httpDelete: vi.fn(),
}));

import { httpGet } from '@/shared/api/http-client';
import { feedKeys, fetchFeedMessages, fetchFeedSources } from './feed-queries';

const mockedHttpGet = httpGet as unknown as ReturnType<typeof vi.fn>;

describe('feed-queries type pinning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchFeedSources defaults to type=crypto-news', async () => {
    mockedHttpGet.mockResolvedValue([]);
    await fetchFeedSources();
    expect(mockedHttpGet).toHaveBeenCalledWith(
      '/ingestion-api/feed/sources?type=crypto-news',
    );
  });

  it('fetchFeedSources forwards an explicit type for reuse', async () => {
    mockedHttpGet.mockResolvedValue([]);
    await fetchFeedSources('kol');
    expect(mockedHttpGet).toHaveBeenCalledWith(
      '/ingestion-api/feed/sources?type=kol',
    );
  });

  it('fetchFeedMessages pins type=crypto-news when passed', async () => {
    mockedHttpGet.mockResolvedValue({ timestamp: '', count: 0, data: [] });
    await fetchFeedMessages(500, undefined, 'crypto-news');
    const url = mockedHttpGet.mock.calls[0][0] as string;
    expect(url).toContain('type=crypto-news');
    expect(url).toContain('limit=500');
  });

  it('sources query key carries the type', () => {
    expect(feedKeys.sources()).toEqual(feedKeys.sources('crypto-news'));
    expect(feedKeys.sources('kol')).toContainEqual({ type: 'kol' });
  });
});
