import { httpPost } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { KolView } from '@/entities/kol/model/types';

export async function addKol(kolId: string): Promise<KolView> {
  return httpPost<{ kolId: string }, KolView>(ENDPOINTS.kols.add, { kolId });
}
