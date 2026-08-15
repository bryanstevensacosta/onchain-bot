// @vitest-environment jsdom
import '@/test/setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { publishAdNow } from '@/features/crypto-news-ads/api/ads-api';

vi.mock('@/features/crypto-news-ads/api/ads-api', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/crypto-news-ads/api/ads-api')
    >();
  return {
    ...actual,
    publishAdNow: vi.fn(),
  };
});

import { usePublishAdNow } from './use-ads';

const mockedPublishAdNow = vi.mocked(publishAdNow);

afterEach(cleanup);

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('usePublishAdNow', () => {
  it('calls publishAdNow(id) from the mutation', async () => {
    mockedPublishAdNow.mockResolvedValue({
      ok: true,
      messageId: 42,
      error: null,
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => usePublishAdNow(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate('ad-1');
    });

    await waitFor(() =>
      expect(mockedPublishAdNow).toHaveBeenCalledWith('ad-1'),
    );
  });

  it('invalidates the ads query on success', async () => {
    mockedPublishAdNow.mockResolvedValue({
      ok: true,
      messageId: 42,
      error: null,
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => usePublishAdNow(), {
      wrapper: makeWrapper(qc),
    });

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    act(() => {
      result.current.mutate('ad-1');
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['crypto-news-ads'],
      }),
    );
  });
});
