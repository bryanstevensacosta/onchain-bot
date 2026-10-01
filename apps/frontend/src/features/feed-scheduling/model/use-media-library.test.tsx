// @vitest-environment jsdom
import '@/test/setup';

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import {
  fetchMediaLibrary,
  reuseLibraryImage,
  type SchedulingView,
} from '@/features/feed-scheduling/api/scheduling-api';

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    // Record the options each hook passes to useQuery while still running
    // the real implementation against the QueryClientProvider harness.
    useQuery: vi.fn(actual.useQuery),
  };
});

vi.mock(
  '@/features/feed-scheduling/api/scheduling-api',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/feed-scheduling/api/scheduling-api')
      >();
    return {
      ...actual,
      fetchMediaLibrary: vi.fn(),
      reuseLibraryImage: vi.fn(),
    };
  },
);

import { useMediaLibrary, useReuseLibraryImage } from './use-scheduling';

const mockedUseQuery = vi.mocked(useQuery);
const mockedFetchMediaLibrary = vi.mocked(fetchMediaLibrary);
const mockedReuseLibraryImage = vi.mocked(reuseLibraryImage);

afterEach(cleanup);

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function makeSchedulingView(
  overrides: Partial<SchedulingView> = {},
): SchedulingView {
  return {
    id: 'scheduling-1',
    name: 'Pump alpha',
    body: 'Something good',
    buttons: null,
    imageMediaId: 'lib-1',
    format: 'text',
    videoMediaId: null,
    albumMediaIds: null,
    enabled: true,
    order: 0,
    timesPublished: 0,
    consecutiveFailures: 0,
    lastPublishedAt: null,
    expiresAt: null,
    expirationAction: 'disable',
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('useMediaLibrary', () => {
  it('mounts a query with key [feed-scheduling, media-library], 5s staleTime and 10s refetchInterval', async () => {
    mockedFetchMediaLibrary.mockResolvedValue([]);
    mockedUseQuery.mockClear();

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useMediaLibrary(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['feed-scheduling', 'media-library'],
        staleTime: 5_000,
        refetchInterval: 10_000,
      }),
    );
    expect(mockedFetchMediaLibrary).toHaveBeenCalledTimes(1);
  });
});

describe('useReuseLibraryImage', () => {
  it('calls reuseLibraryImage(schedulingId, libraryMediaId) from the mutation', async () => {
    mockedReuseLibraryImage.mockResolvedValue(makeSchedulingView());

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useReuseLibraryImage(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        schedulingId: 'scheduling-1',
        libraryMediaId: 'lib-1',
      });
    });

    await waitFor(() =>
      expect(mockedReuseLibraryImage).toHaveBeenCalledWith(
        'scheduling-1',
        'lib-1',
      ),
    );
  });

  it('invalidates both the scheduling list and the media-library query on success', async () => {
    mockedReuseLibraryImage.mockResolvedValue(makeSchedulingView());

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useReuseLibraryImage(), {
      wrapper: makeWrapper(qc),
    });

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    act(() => {
      result.current.mutate({
        schedulingId: 'scheduling-1',
        libraryMediaId: 'lib-1',
      });
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['feed-scheduling', 'media-library'],
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['feed-scheduling'],
    });
  });
});
