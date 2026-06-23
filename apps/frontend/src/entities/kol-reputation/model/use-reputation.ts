import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAllKolReputations,
  fetchKolReputation,
  fetchTopKolReputation,
  reputationKeys,
} from '../api/reputation-queries';
import type { KolReputationView } from './types';

export function useAllKolReputations() {
  return useQuery({
    queryKey: reputationKeys.list(),
    queryFn: fetchAllKolReputations,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * Returns a Map<kolId, KolReputationView> built from `useAllKolReputations`.
 *
 * Use this to look up reputations in O(1) inside render loops without
 * triggering N queries (one per row). Prefer over `useKolReputation(id)`
 * when rendering more than ~3 rows.
 */
export function useKolReputationMap(): {
  readonly byId: ReadonlyMap<string, KolReputationView>;
  readonly get: (kolId: string) => KolReputationView | undefined;
  readonly isLoading: boolean;
} {
  const query = useAllKolReputations();
  const byId = useMemo(() => {
    const m = new Map<string, KolReputationView>();
    for (const r of query.data ?? []) m.set(r.kolId, r);
    return m;
  }, [query.data]);
  return {
    byId,
    get: (kolId) => byId.get(kolId),
    isLoading: query.isLoading,
  };
}

export function useTopKolReputation(limit = 20) {
  return useQuery({
    queryKey: reputationKeys.top(limit),
    queryFn: () => fetchTopKolReputation(limit),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useKolReputation(kolId: string | undefined) {
  return useQuery({
    queryKey: reputationKeys.byKol(kolId ?? ''),
    queryFn: () => fetchKolReputation(kolId!),
    enabled: !!kolId,
  });
}
