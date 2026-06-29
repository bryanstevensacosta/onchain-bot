// @vitest-environment jsdom
import '@/test/setup';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', () => ({
  httpPost: vi.fn(),
}));

vi.mock('@/shared/api/endpoints', () => ({
  ENDPOINTS: {
    kols: {
      list: '/telegram-kol/identity/kols',
      get: (id: string) => `/telegram-kol/identity/kols/${id}`,
      backfill: (id: string) => `/telegram-kol/ingestion/kols/${id}/backfill`,
      add: '/telegram-kol/identity/kols',
      setLifecycle: (id: string) =>
        `/telegram-kol/identity/kols/${id}/lifecycle`,
    },
  },
}));

import { httpPost } from '@/shared/api';
import { addKol } from './add-kol-client';

describe('addKol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs the kolId to the add endpoint', async () => {
    (httpPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: '123',
      handle: null,
      title: '123',
      isActive: false,
      lifecycleStatus: 'ACTIVE',
      lastIngestedAt: null,
    });
    await addKol('123');
    expect(httpPost).toHaveBeenCalledWith('/telegram-kol/identity/kols', {
      kolId: '123',
    });
  });

  it('returns the KolView from the backend', async () => {
    const kol = {
      id: '123',
      handle: 'spydefi',
      title: 'SpyDefi',
      isActive: false,
      lifecycleStatus: 'ACTIVE',
      lastIngestedAt: null,
    };
    (httpPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(kol);
    const result = await addKol('123');
    expect(result).toEqual(kol);
  });

  it('propagates errors from httpPost', async () => {
    (httpPost as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('CONFLICT'),
    );
    await expect(addKol('123')).rejects.toThrow('CONFLICT');
  });
});
