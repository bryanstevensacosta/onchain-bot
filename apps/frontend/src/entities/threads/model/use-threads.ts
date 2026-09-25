import type {
  ContentFilter,
  FeedMessage,
  FeedSource,
} from '@/entities/threads/api/threads-queries';
import {
  useFeedMessages,
  useFeedSources,
  useFilters,
} from '@/entities/feed/model/use-feed';

/**
 * Threads messages — SAME ingestion feed as feed (import-reuse,
 * no copy). Returns the raw messages the threads matcher polls over HTTP.
 */
export function useThreadsMessages(
  limit = 50,
  channelId?: string,
): {
  data: ReadonlyArray<FeedMessage> | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useFeedMessages(limit, channelId);
  return { data, isLoading, error };
}

/**
 * Threads sources — SAME source registry as feed (import-reuse,
 * no copy). Threads has no sources table of its own.
 */
export function useThreadsSources(): {
  data: ReadonlyArray<FeedSource> | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useFeedSources();
  return { data, isLoading, error };
}

/**
 * Threads content filters for a channel — SAME shared filter CRUD as
 * feed (import-reuse, no copy). Disabled until a channel is set.
 */
export function useThreadsFilters(channelId: string): {
  data: ReadonlyArray<ContentFilter> | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useFilters(channelId);
  return { data, isLoading, error };
}

export {
  useCreateFilter as useCreateThreadsFilter,
  useUpdateFilter as useUpdateThreadsFilter,
  useDeleteFilter as useDeleteThreadsFilter,
  useToggleFilter as useToggleThreadsFilter,
} from '@/entities/feed/model/use-feed';
