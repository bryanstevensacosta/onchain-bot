import { httpDelete, httpGet } from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';

export interface QueueEntryView {
  readonly id: string;
  readonly channelId: string;
  readonly sourceHandle: string | null;
  readonly sourceTitle: string | null;
  readonly displayName: string;
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
  readonly duplicateOfSourceHandle?: string | null;
  readonly duplicateOfTelegramUrl?: string | null;
}

export interface QueueCountsView {
  readonly pending: number;
  readonly publishedToday: number;
  readonly remaining: number;
}

/**
 * Feed-publisher queue stats (Tramo 2, todo 9):
 * GET /feed-api/api/queue/stats on feed-publisher
 * (:3040 dev / :3041 staging / :3042 prod). Richer than the legacy
 * counts (per-status depth + tick health) and the plan acceptance
 * probe for the queue migration.
 */
export interface FeedQueueStatsView {
  readonly pending: number;
  readonly scheduled: number;
  readonly publishing: number;
  readonly published: number;
  readonly failed: number;
  readonly blocked: number;
  readonly total: number;
  readonly lastTickAt: string | null;
  readonly lastProcessedAt: string | null;
  readonly consecutiveFailures: number;
}

export const queueKeys = {
  all: ['feed-publisher', 'queue'] as const,
  list: (limit: number, status?: string) =>
    [...queueKeys.all, 'list', { limit, status }] as const,
  counts: () => [...queueKeys.all, 'counts'] as const,
  stats: () => [...queueKeys.all, 'stats'] as const,
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
    `/feed-publisher/queue?${qs.toString()}`,
  );
}

export async function fetchQueueCounts(): Promise<QueueCountsView> {
  return httpGet<QueueCountsView>('/feed-publisher/queue/counts');
}

export async function fetchFeedQueueStats(): Promise<FeedQueueStatsView> {
  return httpGet<FeedQueueStatsView>(ENDPOINTS.feedPublisher.queue.stats());
}

export async function cancelQueueEntry(id: string): Promise<void> {
  await httpDelete<void>(`/feed-publisher/queue/${encodeURIComponent(id)}`);
}
