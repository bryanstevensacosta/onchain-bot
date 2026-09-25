import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api/http-client', () => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPatch: vi.fn(),
  httpPut: vi.fn(),
  httpDelete: vi.fn(),
}));

import { httpGet } from '@/shared/api/http-client';
import {
  cryptoNewsKeys,
  fetchCryptoNewsMessages,
  fetchCryptoNewsSources,
} from './crypto-news-queries';

const mockedHttpGet = httpGet as unknown as ReturnType<typeof vi.fn>;

describe('crypto-news-queries type pinning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchCryptoNewsSources defaults to type=crypto-news', async () => {
    mockedHttpGet.mockResolvedValue([]);
    await fetchCryptoNewsSources();
    expect(mockedHttpGet).toHaveBeenCalledWith(
      '/ingestion-api/feed/sources?type=crypto-news',
    );
  });

  it('fetchCryptoNewsSources forwards an explicit type for reuse', async () => {
    mockedHttpGet.mockResolvedValue([]);
    await fetchCryptoNewsSources('kol');
    expect(mockedHttpGet).toHaveBeenCalledWith(
      '/ingestion-api/feed/sources?type=kol',
    );
  });

  it('fetchCryptoNewsMessages pins type=crypto-news when passed', async () => {
    mockedHttpGet.mockResolvedValue({ timestamp: '', count: 0, data: [] });
    await fetchCryptoNewsMessages(500, undefined, 'crypto-news');
    const url = mockedHttpGet.mock.calls[0][0] as string;
    expect(url).toContain('type=crypto-news');
    expect(url).toContain('limit=500');
  });

  it('sources query key carries the type', () => {
    expect(cryptoNewsKeys.sources()).toEqual(
      cryptoNewsKeys.sources('crypto-news'),
    );
    expect(cryptoNewsKeys.sources('kol')).toContainEqual({ type: 'kol' });
  });
});
