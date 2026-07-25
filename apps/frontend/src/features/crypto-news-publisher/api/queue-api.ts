import { httpGet, HttpError } from '@/shared/api/http-client';
import { API_BASE_URL } from '@/shared/config/env';

export interface QueueEntryView {
  readonly id: string;
  readonly channelId: string;
  readonly sourceHandle: string | null;
  readonly sourceTitle: string | null;
  readonly messageId: number;
  readonly rawTitle: string | null;
  readonly rawContent: string | null;
  readonly imagePath: string | null;
  readonly imagePaths: string[];
  readonly groupedId: string | null;
  readonly matchedKeywordIds: string[];
  readonly status: string;
  readonly messageReceivedAt: string;
  readonly publishedAt: string | null;
  readonly telegramMessageId: string | null;
  readonly telegramUrl: string | null;
  readonly lastError: string | null;
  readonly attempts: number;
  readonly generatedContent: string | null;
  readonly generatedSystemPrompt: string | null;
  readonly generatedUserPrompt: string | null;
  readonly generatedTemperature: number | null;
  readonly generatedReasoningEffort: string | null;
  readonly generatedModel: string | null;
  readonly blockedReason: string | null;
  readonly duplicateOfChannelId?: string;
  readonly duplicateOfMessageId?: number;
  readonly duplicateOfEntryId?: string;
}

export interface QueueCountsView {
  readonly pending: number;
  readonly publishedToday: number;
  readonly remaining: number;
}

export const queueKeys = {
  all: ['crypto-news-publisher', 'queue'] as const,
  list: (limit: number, status?: string) =>
    [...queueKeys.all, 'list', { limit, status }] as const,
  counts: () => [...queueKeys.all, 'counts'] as const,
};

export async function fetchQueue(
  limit = 50,
  status?: string,
): Promise<ReadonlyArray<QueueEntryView>> {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (status) {
    qs.set('status', status);
  }
  return httpGet<ReadonlyArray<QueueEntryView>>(
    `/crypto-news-publisher/queue?${qs.toString()}`,
  );
}

export async function fetchQueueCounts(): Promise<QueueCountsView> {
  return httpGet<QueueCountsView>('/crypto-news-publisher/queue/counts');
}

export async function cancelQueueEntry(id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/crypto-news-publisher/queue/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(res.status, body, `DELETE queue/${id} → ${res.status}`);
  }
}
