import { useQuery } from '@tanstack/react-query';
import {
  fetchRecentScores,
  fetchScoreByToken,
  fetchTopScores,
  scoreKeys,
} from '../api/score-queries';

export function useRecentScores(limit = 30) {
  return useQuery({
    queryKey: scoreKeys.recent(limit),
    queryFn: () => fetchRecentScores(limit),
    refetchInterval: 5_000,
  });
}

export function useTopScores(limit = 20) {
  return useQuery({
    queryKey: scoreKeys.top(limit),
    queryFn: () => fetchTopScores(limit),
    refetchInterval: 5_000,
  });
}

export function useScoreByToken(
  chain: string | undefined,
  address: string | undefined,
) {
  return useQuery({
    queryKey: scoreKeys.byToken(chain ?? '', address ?? ''),
    queryFn: () => fetchScoreByToken(chain!, address!),
    enabled: !!chain && !!address,
  });
}
