// @vitest-environment jsdom
import '@/test/setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { publishSchedulingNow } from '@/features/feed-scheduling/api/scheduling-api';

vi.mock(
  '@/features/feed-scheduling/api/scheduling-api',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/feed-scheduling/api/scheduling-api')
      >();
    return {
      ...actual,
      publishSchedulingNow: vi.fn(),
    };
  },
);

import { usePublishSchedulingNow } from './use-scheduling';

const mockedPublishAdNow = vi.mocked(publishSchedulingNow);

afterEach(cleanup);

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('usePublishSchedulingNow', () => {
  it('calls publishSchedulingNow(id) from the mutation', async () => {
    mockedPublishAdNow.mockResolvedValue({
      ok: true,
      messageId: 42,
      error: null,
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => usePublishSchedulingNow(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate('scheduling-1');
    });

    await waitFor(() =>
      expect(mockedPublishAdNow).toHaveBeenCalledWith('scheduling-1'),
    );
  });

  it('invalidates the scheduling query on success', async () => {
    mockedPublishAdNow.mockResolvedValue({
      ok: true,
      messageId: 42,
      error: null,
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => usePublishSchedulingNow(), {
      wrapper: makeWrapper(qc),
    });

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    act(() => {
      result.current.mutate('scheduling-1');
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['feed-scheduling'],
      }),
    );
  });
});
