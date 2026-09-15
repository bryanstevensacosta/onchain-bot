import type {
  ContentFilter,
  CryptoNewsMessage,
  CryptoNewsSource,
} from '@/entities/threads/api/threads-queries';
import {
  useCryptoNewsMessages,
  useCryptoNewsSources,
  useFilters,
} from '@/entities/crypto-news/model/use-crypto-news';

/**
 * Threads messages — SAME ingestion feed as crypto-news (import-reuse,
 * no copy). Returns the raw messages the threads matcher polls over HTTP.
 */
export function useThreadsMessages(
  limit = 50,
  channelId?: string,
): {
  data: ReadonlyArray<CryptoNewsMessage> | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useCryptoNewsMessages(limit, channelId);
  return { data, isLoading, error };
}

/**
 * Threads sources — SAME source registry as crypto-news (import-reuse,
 * no copy). Threads has no sources table of its own.
 */
export function useThreadsSources(): {
  data: ReadonlyArray<CryptoNewsSource> | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useCryptoNewsSources();
  return { data, isLoading, error };
}

/**
 * Threads content filters for a channel — SAME shared filter CRUD as
 * crypto-news (import-reuse, no copy). Disabled until a channel is set.
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
} from '@/entities/crypto-news/model/use-crypto-news';
