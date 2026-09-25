import { useQuery } from '@tanstack/react-query';
import {
  fetchFeedThreadsStatus,
  feedThreadsKeys,
  type FeedThreadsStatus,
} from '@/features/feed-publisher/api/threads-stub-api';

/**
 * Feed-publisher threads stub status (v1 skeleton, C1).
 * Never throws to the UI: consumers render the deferred-to-v2
 * empty-state on error (API down or still-501 alike).
 */
export function useFeedThreadsStatus() {
  return useQuery<FeedThreadsStatus>({
    queryKey: feedThreadsKeys.status(),
    queryFn: fetchFeedThreadsStatus,
    staleTime: 30_000,
    retry: false,
  });
}
