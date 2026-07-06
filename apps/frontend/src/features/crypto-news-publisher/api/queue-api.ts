import { httpGet } from '@/shared/api/http-client';

export interface QueueEntryView {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly rawTitle: string | null;
  readonly imagePath: string | null;
  readonly groupedId: string | null;
  readonly status: string;
  readonly messageReceivedAt: string;
  readonly publishedAt: string | null;
  readonly telegramMessageId: string | null;
  readonly lastError: string | null;
  readonly attempts: number;
}

export interface QueueCountsView {
  readonly pending: number;
  readonly publishedToday: number;
  readonly remaining: number;
}

export const queueKeys = {
  all: ['crypto-news-publisher', 'queue'] as const,
  list: (limit: number) => [...queueKeys.all, 'list', { limit }] as const,
  counts: () => [...queueKeys.all, 'counts'] as const,
};

export async function fetchQueue(
  limit = 50,
): Promise<ReadonlyArray<QueueEntryView>> {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  return httpGet<ReadonlyArray<QueueEntryView>>(
    `/crypto-news-publisher/queue?${qs.toString()}`,
  );
}

export async function fetchQueueCounts(): Promise<QueueCountsView> {
  return httpGet<QueueCountsView>('/crypto-news-publisher/queue/counts');
}
