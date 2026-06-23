import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { KolReputationView } from '../model/types';

export const reputationKeys = {
  all: ['kol-reputation'] as const,
  list: () => [...reputationKeys.all, 'list'] as const,
  top: (limit = 20) => [...reputationKeys.all, 'top', limit] as const,
  byKol: (id: string) => [...reputationKeys.all, id] as const,
};

export async function fetchAllKolReputations(): Promise<
  ReadonlyArray<KolReputationView>
> {
  return httpGet<ReadonlyArray<KolReputationView>>(ENDPOINTS.reputation.list);
}

export async function fetchTopKolReputation(
  limit = 20,
): Promise<ReadonlyArray<KolReputationView>> {
  return httpGet<ReadonlyArray<KolReputationView>>(
    `${ENDPOINTS.reputation.top}?limit=${limit}`,
  );
}

export async function fetchKolReputation(
  id: string,
): Promise<KolReputationView> {
  return httpGet<KolReputationView>(ENDPOINTS.reputation.byKol(id));
}
