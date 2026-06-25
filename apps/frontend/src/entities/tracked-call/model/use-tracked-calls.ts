import { useQuery } from '@tanstack/react-query';
import {
  fetchTrackedCalls,
  fetchTrackedCall,
  postGateAllow,
  trackedCallKeys,
  type TrackedCallsFilters,
} from '../api/tracked-calls-queries';
import { useMutation } from '@tanstack/react-query';

export function useTrackedCalls(filters: TrackedCallsFilters = {}) {
  return useQuery({
    queryKey: trackedCallKeys.list(filters),
    queryFn: () => fetchTrackedCalls(filters),
    refetchInterval: 30_000,
  });
}

export function useTrackedCall(chain: string, address: string) {
  return useQuery({
    queryKey: trackedCallKeys.detail(chain, address),
    queryFn: () => fetchTrackedCall(chain, address),
    enabled: Boolean(chain && address),
  });
}

export function useGateAllow() {
  return useMutation({
    mutationFn: (input: { chain: string; address: string }) =>
      postGateAllow(input),
  });
}
