import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { CanonicalTokenCallView } from '../model/types';

export const canonicalKeys = {
  all: ['canonical'] as const,
  recent: (limit = 30) => [...canonicalKeys.all, 'recent', limit] as const,
  byToken: (chain: string, address: string) =>
    [...canonicalKeys.all, chain, address] as const,
};

export async function fetchRecentCanonical(
  limit = 30,
): Promise<ReadonlyArray<CanonicalTokenCallView>> {
  return httpGet<ReadonlyArray<CanonicalTokenCallView>>(
    `${ENDPOINTS.normalization.recent}?limit=${limit}`,
  );
}

export async function fetchCanonical(
  chain: string,
  address: string,
): Promise<CanonicalTokenCallView> {
  return httpGet<CanonicalTokenCallView>(
    ENDPOINTS.normalization.byToken(chain, address),
  );
}
