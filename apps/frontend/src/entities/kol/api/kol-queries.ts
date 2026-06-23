import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { KolView } from '../model/types';

export const kolKeys = {
  all: ['kols'] as const,
  list: () => [...kolKeys.all, 'list'] as const,
  detail: (id: string) => [...kolKeys.all, 'detail', id] as const,
};

export async function fetchKols(): Promise<ReadonlyArray<KolView>> {
  return httpGet<ReadonlyArray<KolView>>(ENDPOINTS.kols.list);
}

export async function fetchKol(id: string): Promise<KolView> {
  return httpGet<KolView>(ENDPOINTS.kols.get(id));
}
