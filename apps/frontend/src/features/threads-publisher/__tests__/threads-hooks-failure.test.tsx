// @vitest-environment jsdom
import '@/test/setup';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createElement, type ReactNode } from 'react';

import { useThreadsKeywords } from '@/features/threads-publisher/model/use-threads-keywords';
import { useThreadsQueue } from '@/features/threads-publisher/model/use-threads-queue';
import { useThreadsMatchingHealth } from '@/features/threads-publisher/model/use-threads-llm-config';

/**
 * Backend-down failure spec: every request fails at the network level.
 * Hooks must surface a visible `error` without crashing the render.
 */
const server = setupServer(http.all('*', () => HttpResponse.error()));

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper(): ({ children }: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe('threads hooks when the backend is down', () => {
  it('useThreadsKeywords surfaces error without crashing', async () => {
    const { result } = renderHook(() => useThreadsKeywords(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).not.toBeNull();
  });

  it('useThreadsQueue surfaces error without crashing', async () => {
    const { result } = renderHook(() => useThreadsQueue(10), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).not.toBeNull();
  });

  it('useThreadsMatchingHealth surfaces error without crashing (retry:false)', async () => {
    const { result } = renderHook(() => useThreadsMatchingHealth(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).not.toBeNull();
  });
});
