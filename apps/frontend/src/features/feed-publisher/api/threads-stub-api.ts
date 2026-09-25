import { API_BASE_URL } from '@/shared/config/env';
import { ENDPOINTS } from '@/shared/api/endpoints';

/** v1 skeleton code (C1): every feed-publisher threads route answers it. */
export const FEED_THREADS_NOT_IMPLEMENTED = 'THREADS_NOT_IMPLEMENTED';

export interface FeedThreadsStatus {
  readonly error: string;
  readonly message: string;
}

export const feedThreadsKeys = {
  all: ['feed-publisher', 'threads', 'status'] as const,
  status: () => [...feedThreadsKeys.all] as const,
};

/**
 * Feed-publisher threads stub status (Tramo 2, todo 9):
 * GET /feed-api/api/threads. The v1 skeleton answers 501 with the
 * THREADS_NOT_IMPLEMENTED body — resolved (not thrown) so the UI can
 * render the stub state. True network errors still reject.
 */
export async function fetchFeedThreadsStatus(): Promise<FeedThreadsStatus> {
  const res = await fetch(
    `${API_BASE_URL}${ENDPOINTS.feedPublisher.threads.root()}`,
    { method: 'GET' },
  );
  return (await res.json()) as FeedThreadsStatus;
}
