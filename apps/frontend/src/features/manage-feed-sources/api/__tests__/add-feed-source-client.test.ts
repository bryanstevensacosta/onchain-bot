// @vitest-environment jsdom
import '@/test/setup';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api/http-client', () => ({
  httpPost: vi.fn(),
}));

vi.mock('@/shared/api/endpoints', () => ({
  ENDPOINTS: {
    feed: {
      sources: {
        add: '/ingestion-api/feed/sources',
      },
    },
  },
}));

import { httpPost } from '@/shared/api/http-client';
import { addFeedSource } from '../add-feed-source-client';

describe('addFeedSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs the channelId to the add endpoint', async () => {
    (httpPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      channelId: '1234567890',
      handle: 'WatcherGuru',
      title: 'WatcherGuru',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2026-07-03T00:00:00.000Z',
    });
    await addFeedSource({ channelId: '1234567890' });
    expect(httpPost).toHaveBeenCalledWith('/ingestion-api/feed/sources', {
      channelId: '1234567890',
    });
  });

  it('returns the FeedSource from the backend', async () => {
    const source = {
      channelId: '1234567890',
      handle: 'WatcherGuru',
      title: 'WatcherGuru',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2026-07-03T00:00:00.000Z',
    };
    (httpPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(source);
    const result = await addFeedSource({ channelId: '1234567890' });
    expect(result).toEqual(source);
  });

  it('propagates errors from httpPost', async () => {
    (httpPost as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('CONFLICT'),
    );
    await expect(addFeedSource({ channelId: '1234567890' })).rejects.toThrow(
      'CONFLICT',
    );
  });
});
