import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpPost } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import { kolKeys } from '@/entities/kol';
import type { KolLifecycleStatus } from '@/entities/kol/model/types';

export async function setKolLifecycle(
  kolId: string,
  status: KolLifecycleStatus,
): Promise<{ id: string; lifecycleStatus: KolLifecycleStatus }> {
  return httpPost<
    { status: KolLifecycleStatus },
    { id: string; lifecycleStatus: KolLifecycleStatus }
  >(ENDPOINTS.kols.setLifecycle(kolId), { status });
}

export function useSetKolLifecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      kolId,
      status,
    }: {
      kolId: string;
      status: KolLifecycleStatus;
    }) => setKolLifecycle(kolId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kolKeys.all });
      qc.invalidateQueries({ queryKey: ['kol-reputation'] });
    },
  });
}
