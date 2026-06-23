import { useQuery } from '@tanstack/react-query';
import {
  canonicalKeys,
  fetchCanonical,
  fetchRecentCanonical,
} from '../api/canonical-queries';

export function useRecentCanonical(limit = 30) {
  return useQuery({
    queryKey: canonicalKeys.recent(limit),
    queryFn: () => fetchRecentCanonical(limit),
    refetchInterval: 10_000,
  });
}

export function useCanonical(
  chain: string | undefined,
  address: string | undefined,
) {
  return useQuery({
    queryKey: canonicalKeys.byToken(chain ?? '', address ?? ''),
    queryFn: () => fetchCanonical(chain!, address!),
    enabled: !!chain && !!address,
  });
}
