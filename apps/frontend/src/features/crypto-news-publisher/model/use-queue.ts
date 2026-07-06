import { useQuery } from '@tanstack/react-query';
import {
  fetchQueue,
  fetchQueueCounts,
  queueKeys,
  type QueueCountsView,
  type QueueEntryView,
} from '@/features/crypto-news-publisher/api/queue-api';

/**
 * Live view of the publisher queue — auto-refreshes every 10s.
 * Backend caps `limit` at 500.
 */
export function useQueue(limit = 50) {
  return useQuery<ReadonlyArray<QueueEntryView>>({
    queryKey: queueKeys.list(limit),
    queryFn: () => fetchQueue(limit),
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
