import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  cryptoNewsKeys,
  fetchCryptoNewsMessages,
  fetchCryptoNewsSources,
  fetchFilters,
  createFilter,
  updateFilter,
  deleteFilter,
  toggleFilter,
  type CryptoNewsMessage,
  type CryptoNewsSource,
  type ContentFilter,
  type CreateFilterDto,
  type UpdateFilterDto,
} from '@/entities/crypto-news/api/crypto-news-queries';

export function useCryptoNewsMessages(limit = 50, channelId?: string) {
  return useQuery<ReadonlyArray<CryptoNewsMessage>>({
    queryKey: cryptoNewsKeys.messages(limit, channelId),
    queryFn: () => fetchCryptoNewsMessages(limit, channelId),
    refetchInterval: 15_000,
  });
}

export function useCryptoNewsSources() {
  return useQuery<ReadonlyArray<CryptoNewsSource>>({
    queryKey: cryptoNewsKeys.sources(),
    queryFn: () => fetchCryptoNewsSources(),
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
    queryKey: cryptoNewsKeys.filters(channelId),
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
        queryKey: cryptoNewsKeys.filters(data.channelId),
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
        queryKey: cryptoNewsKeys.filters(data.channelId),
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
        queryKey: cryptoNewsKeys.all,
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
        queryKey: cryptoNewsKeys.all,
      });
    },
  });
}
