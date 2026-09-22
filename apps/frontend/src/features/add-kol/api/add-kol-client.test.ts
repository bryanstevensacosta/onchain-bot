// @vitest-environment jsdom
import '@/test/setup';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', () => ({
  httpPost: vi.fn(),
}));

vi.mock('@/shared/api/endpoints', () => ({
  ENDPOINTS: {
    kols: {
      list: '/ingestion-api/feed/sources?type=kol',
      add: '/ingestion-api/feed/sources',
      toggle: (id: string) =>
        `/ingestion-api/feed/sources/${encodeURIComponent(id)}/toggle`,
      backfill: (id: string) => `/telegram-kol/identity/kols/${id}/backfill`,
    },
  },
}));

import { httpPost } from '@/shared/api';
import { addKol } from './add-kol-client';

describe('addKol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs channelId + type=kol to the feed sources endpoint', async () => {
    (httpPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      channelId: '-100123',
      handle: null,
      title: '-100123',
      type: 'kol',
      isActive: false,
      lifecycleStatus: 'ACTIVE',
    });
    await addKol('-100123');
    expect(httpPost).toHaveBeenCalledWith('/ingestion-api/feed/sources', {
      channelId: '-100123',
      type: 'kol',
    });
  });

  it('maps the feed source to a KolView', async () => {
    (httpPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      channelId: '-100123',
      handle: 'spydefi',
      title: 'SpyDefi',
      type: 'kol',
      isActive: false,
      lifecycleStatus: 'ACTIVE',
    });
    const result = await addKol('-100123');
    expect(result).toEqual({
      id: '-100123',
      handle: 'spydefi',
      title: 'SpyDefi',
      isActive: false,
      lifecycleStatus: 'ACTIVE',
      lastIngestedAt: null,
    });
  });

  it('maps INACTIVE feed lifecycle to DORMANT', async () => {
    (httpPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      channelId: '-100123',
      handle: null,
      title: '-100123',
      type: 'kol',
      isActive: false,
      lifecycleStatus: 'INACTIVE',
    });
    const result = await addKol('-100123');
    expect(result.lifecycleStatus).toBe('DORMANT');
  });

  it('propagates errors from httpPost', async () => {
    (httpPost as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('CONFLICT'),
    );
    await expect(addKol('-100123')).rejects.toThrow('CONFLICT');
  });
});
