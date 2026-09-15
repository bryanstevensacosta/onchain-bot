import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelThreadsQueueEntry,
  fetchThreadsQueue,
  fetchThreadsQueueCounts,
  threadsQueueKeys,
  type ThreadsQueueCountsView,
  type ThreadsQueueEntryView,
} from '@/features/threads-publisher/api/queue-api';

/**
 * Live view of the threads publisher queue — auto-refreshes every 10s.
 * Backend caps `limit` at 500.
 */
export function useThreadsQueue(
  limit = 50,
  status?: string,
): {
  data: ReadonlyArray<ThreadsQueueEntryView> | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery<
    ReadonlyArray<ThreadsQueueEntryView>
  >({
    queryKey: threadsQueueKeys.list(limit, status),
    queryFn: () => fetchThreadsQueue(limit, status),
    refetchInterval: 10_000,
  });
  return { data, isLoading, error };
}

/**
 * Pending / published-today / remaining-today counters — refreshed on
 * the same cadence as the queue list so the dashboard cards stay in
 * sync with the table.
 */
export function useThreadsQueueCounts(): {
  data: ThreadsQueueCountsView | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<ThreadsQueueCountsView>({
    queryKey: threadsQueueKeys.counts(),
    queryFn: fetchThreadsQueueCounts,
    refetchInterval: 10_000,
  });
  return { data, isLoading };
}

export function useCancelThreadsQueueEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelThreadsQueueEntry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: threadsQueueKeys.all });
    },
  });
}
