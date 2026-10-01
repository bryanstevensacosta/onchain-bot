// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FEED_THREADS_NOT_IMPLEMENTED,
  fetchFeedThreadsStatus,
} from './threads-stub-api';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchFeedThreadsStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hits the feed-publisher threads root behind /feed-api', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ error: 'THREADS_NOT_IMPLEMENTED', message: 'v2' }),
      );
    await fetchFeedThreadsStatus();
    expect(fetchMock).toHaveBeenCalledWith(
      '/feed-api/api/threads',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('resolves the 501 stub body instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'THREADS_NOT_IMPLEMENTED', message: 'v2' }),
        { status: 501, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const status = await fetchFeedThreadsStatus();
    expect(status.error).toBe(FEED_THREADS_NOT_IMPLEMENTED);
  });
});
