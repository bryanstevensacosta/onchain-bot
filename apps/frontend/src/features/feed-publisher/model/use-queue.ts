import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelQueueEntry,
  fetchFeedQueueStats,
  fetchQueue,
  fetchQueueCounts,
  queueKeys,
  type FeedQueueStatsView,
  type QueueCountsView,
  type QueueEntryView,
} from '@/features/feed-publisher/api/queue-api';

/**
 * Live view of the publisher queue — auto-refreshes every 10s.
 * Backend caps `limit` at 500.
 */
export function useQueue(limit = 50, status?: string) {
  return useQuery<ReadonlyArray<QueueEntryView>>({
    queryKey: queueKeys.list(limit, status),
    queryFn: () => fetchQueue(limit, status),
    refetchInterval: 10_000,
  });
}

/**
 * Pending / published-today / remaining-today counters — refreshed on
 * the same cadence as the queue list so the dashboard cards stay in
 * sync with the table.
 */
export function useQueueCounts() {
  return useQuery<QueueCountsView>({
    queryKey: queueKeys.counts(),
    queryFn: fetchQueueCounts,
    refetchInterval: 10_000,
  });
}

/**
 * Feed-publisher queue stats (GET /feed-api/api/queue/stats, 10 s).
 * Per-status depth + tick health from the new service; never throws
 * to the UI (stats strip hides on error, legacy counts stay).
 */
export function useFeedQueueStats() {
  return useQuery<FeedQueueStatsView>({
    queryKey: queueKeys.stats(),
    queryFn: fetchFeedQueueStats,
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: false,
  });
}

export function useCancelQueueEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelQueueEntry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queueKeys.all });
    },
  });
}
