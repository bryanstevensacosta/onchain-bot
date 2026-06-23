import { useQuery } from '@tanstack/react-query';
import { fetchSnapshotByToken, snapshotKeys } from '../api/snapshot-queries';

export function useSnapshot(
  chain: string | undefined,
  address: string | undefined,
) {
  return useQuery({
    queryKey: snapshotKeys.byToken(chain ?? '', address ?? ''),
    queryFn: () => fetchSnapshotByToken(chain!, address!),
    enabled: !!chain && !!address,
  });
}
