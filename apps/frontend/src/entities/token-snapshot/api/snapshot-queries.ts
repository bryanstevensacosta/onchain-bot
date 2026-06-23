import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { TokenSnapshotView } from '../model/types';

export const snapshotKeys = {
  all: ['snapshot'] as const,
  byToken: (chain: string, address: string) =>
    [...snapshotKeys.all, chain, address] as const,
};

export async function fetchSnapshotByToken(
  chain: string,
  address: string,
): Promise<TokenSnapshotView> {
  return httpGet<TokenSnapshotView>(
    ENDPOINTS.enrichment.byToken(chain, address),
  );
}
