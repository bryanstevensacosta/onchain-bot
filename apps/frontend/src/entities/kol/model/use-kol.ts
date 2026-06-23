import { useQuery } from '@tanstack/react-query';
import { kolKeys, fetchKols, fetchKol } from '../api/kol-queries';

export function useKols() {
  return useQuery({
    queryKey: kolKeys.list(),
    queryFn: fetchKols,
    refetchInterval: 30_000,
  });
}

export function useKol(id: string | undefined) {
  return useQuery({
    queryKey: kolKeys.detail(id ?? ''),
    queryFn: () => fetchKol(id!),
    enabled: !!id,
  });
}
