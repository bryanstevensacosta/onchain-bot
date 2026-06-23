import { useQuery } from '@tanstack/react-query';
import {
  fetchFailed,
  fetchPublished,
  publishedKeys,
} from '../api/published-queries';

export function usePublished(limit = 30) {
  return useQuery({
    queryKey: publishedKeys.published(limit),
    queryFn: () => fetchPublished(limit),
    refetchInterval: 5_000,
  });
}

export function useFailed(limit = 30) {
  return useQuery({
    queryKey: publishedKeys.failed(limit),
    queryFn: () => fetchFailed(limit),
    refetchInterval: 15_000,
  });
}
