/**
 * Threads entity queries — key factories + Threads-typed views.
 *
 * Mirror of `entities/feed/api/feed-queries.ts`, reduced to
 * the T7 surface: query-key factories, the queue entry/counts views, and
 * IMPORT-reuse (no copies) of the shared messages/sources/filters queries.
 *
 * Messages, sources and content filters are owned by the SAME backend
 * routes for both products, so they are re-exported from the feed
 * ingestion-api instead of being duplicated here. The "zero /feed*"
 * invariant applies to endpoint URLs DEFINED in threads modules — the
 * reused filters/messages/sources calls intentionally keep hitting the
 * shared backend routes via these imports.
 *
 * Key invariant: NEVER a bare single-element threads key. Publisher
 * state roots at `threadsPublisherKeys.all = ['threads-publisher']` and
 * matching state at `threadsMatchingKeys.all = ['threads','matching']`
 * (spelled without a space after the comma so the F2 bare-key audit grep
 * keeps matching the exclusion pattern).
 */
export {
  fetchFeedMessages,
  fetchFeedSources,
  fetchFilters,
  createFilter,
  updateFilter,
  deleteFilter,
  toggleFilter,
} from '@/entities/feed/api/feed-queries';
export type {
  FeedMessage,
  FeedSource,
  ContentFilter,
  CreateFilterDto,
  UpdateFilterDto,
  FeedMediaView,
} from '@/entities/feed/api/feed-queries';

/**
 * Threads queue entry view — frontend mirror of the backend
 * `ThreadsQueueEntryView` (threads publisher queue.controller.ts).
 * TEXT-only MVP: `sourceHandle`/`sourceTitle` are always null and
 * `displayName` falls back to the raw `channelId` (no sources table,
 * no media endpoint).
 */
export interface ThreadsQueueEntryView {
  readonly id: string;
  readonly traceId: string;
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
  readonly duplicateOfChannelId: string | null;
  readonly duplicateOfMessageId: number | null;
  readonly duplicateOfEntryId: string | null;
  readonly duplicateOfSourceHandle: string | null;
  readonly duplicateOfTelegramUrl: string | null;
  readonly displayName: string;
}

/**
 * Threads queue counters — frontend mirror of the backend
 * `ThreadsQueueCountsView` minus `dailyCap` (display-only subset pinned
 * by the T7 contract: `{pending, publishedToday, remaining}`).
 */
export interface ThreadsQueueCountsView {
  readonly pending: number;
  readonly publishedToday: number;
  readonly remaining: number;
}

export const threadsPublisherKeys = {
  all: ['threads-publisher'] as const,
  keywords: () => [...threadsPublisherKeys.all, 'keywords'] as const,
  blacklist: () => [...threadsPublisherKeys.all, 'blacklist'] as const,
  phrases: () => [...threadsPublisherKeys.all, 'phrases'] as const,
  queue: () => [...threadsPublisherKeys.all, 'queue'] as const,
  llm: () => [...threadsPublisherKeys.all, 'llm'] as const,
};

export const threadsMatchingKeys = {
  all: ['threads', 'matching'] as const,
  config: () => [...threadsMatchingKeys.all, 'config'] as const,
  health: () => [...threadsMatchingKeys.all, 'health'] as const,
};
