import { httpGet, HttpError } from '@/shared/api/http-client';
import { API_BASE_URL } from '@/shared/config/env';
import {
  threadsPublisherKeys,
  type ThreadsQueueCountsView,
  type ThreadsQueueEntryView,
} from '@/entities/threads';

export type { ThreadsQueueCountsView, ThreadsQueueEntryView };

export const threadsQueueKeys = {
  all: [...threadsPublisherKeys.all, 'queue'] as const,
  list: (limit: number, status?: string) =>
    [...threadsQueueKeys.all, 'list', { limit, status }] as const,
  counts: () => [...threadsQueueKeys.all, 'counts'] as const,
};

export async function fetchThreadsQueue(
  limit = 50,
  status?: string,
): Promise<ReadonlyArray<ThreadsQueueEntryView>> {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (status) {
    qs.set('status', status);
  }
  return httpGet<ReadonlyArray<ThreadsQueueEntryView>>(
    `/threads-publisher/queue?${qs.toString()}`,
  );
}

export async function fetchThreadsQueueCounts(): Promise<ThreadsQueueCountsView> {
  return httpGet<ThreadsQueueCountsView>('/threads-publisher/queue/counts');
}

export async function cancelThreadsQueueEntry(id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/threads-publisher/queue/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(res.status, body, `DELETE queue/${id} → ${res.status}`);
  }
}
