import { useQuery } from '@tanstack/react-query';
import { feedKeys } from '@/entities/feed';
import { listFeedSources } from '../api/list-feed-sources-client';

export function useFeedSources() {
  return useQuery({
    queryKey: feedKeys.sources(),
    queryFn: listFeedSources,
    staleTime: 30_000,
  });
}
