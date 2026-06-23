import { useQuery } from '@tanstack/react-query';
import {
  decisionKeys,
  fetchApproved,
  fetchRecentDecisions,
  fetchRejected,
} from '../api/decision-queries';

export function useRecentDecisions(limit = 30) {
  return useQuery({
    queryKey: decisionKeys.recent(limit),
    queryFn: () => fetchRecentDecisions(limit),
    refetchInterval: 5_000,
  });
}

export function useApproved(limit = 30) {
  return useQuery({
    queryKey: decisionKeys.approved(limit),
    queryFn: () => fetchApproved(limit),
    refetchInterval: 5_000,
  });
}

export function useRejected(limit = 30) {
  return useQuery({
    queryKey: decisionKeys.rejected(limit),
    queryFn: () => fetchRejected(limit),
    refetchInterval: 5_000,
  });
}
