import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  feedKeys,
  fetchFeedMessages,
  fetchFeedSources,
  fetchFilters,
  createFilter,
  updateFilter,
  deleteFilter,
  toggleFilter,
  type FeedMessage,
  type FeedSource,
  type ContentFilter,
  type CreateFilterDto,
  type FeedMessageType,
  type UpdateFilterDto,
} from '@/entities/feed/api/feed-queries';

export function useFeedMessages(
  limit = 50,
  channelId?: string,
  type?: FeedMessageType,
) {
  return useQuery<ReadonlyArray<FeedMessage>>({
    queryKey: feedKeys.messages(limit, channelId, type),
    queryFn: () => fetchFeedMessages(limit, channelId, type),
    refetchInterval: 15_000,
  });
}

export function useFeedSources(type: FeedMessageType = 'crypto-news') {
  return useQuery<ReadonlyArray<FeedSource>>({
    queryKey: feedKeys.sources(type),
    queryFn: () => fetchFeedSources(type),
    refetchInterval: 30_000,
  });
}

// ====================================================================
// CONTENT FILTER HOOKS
// ====================================================================

/**
 * Hook to fetch all content filters for a specific channel.
 * Returns filters ordered by priority ASC, then createdAt ASC.
 */
export function useFilters(channelId: string) {
  return useQuery<ReadonlyArray<ContentFilter>>({
    queryKey: feedKeys.filters(channelId),
    queryFn: () => fetchFilters(channelId),
    enabled: Boolean(channelId),
  });
}

/**
 * Hook to create a new content filter.
 * Invalidates the filters query on success.
 */
export function useCreateFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateFilterDto) => createFilter(dto),
    onSuccess: (data) => {
      // Invalidate the filters query for this channel
      queryClient.invalidateQueries({
        queryKey: feedKeys.filters(data.channelId),
      });
    },
  });
}

/**
 * Hook to update an existing content filter.
 * Invalidates the filters query on success.
 */
export function useUpdateFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateFilterDto }) =>
      updateFilter(id, dto),
    onSuccess: (data) => {
      // Invalidate the filters query for this channel
      queryClient.invalidateQueries({
        queryKey: feedKeys.filters(data.channelId),
      });
    },
  });
}

/**
 * Hook to delete a content filter.
 * Invalidates all filters queries on success (since we don't know which channel it belonged to).
 */
export function useDeleteFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteFilter(id),
    onSuccess: () => {
      // Invalidate all filter queries since we don't track channelId on delete
      queryClient.invalidateQueries({
        queryKey: feedKeys.all,
      });
    },
  });
}

/**
 * Hook to toggle the isActive state of a content filter.
 * Invalidates all filters queries on success.
 */
export function useToggleFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => toggleFilter(id),
    onSuccess: () => {
      // Invalidate all filter queries
      queryClient.invalidateQueries({
        queryKey: feedKeys.all,
      });
    },
  });
}
