import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kolKeys } from '@/entities/kol';
import type { KolView } from '@/entities/kol/model/types';
import { addKol } from '../api/add-kol-client';

export function useAddKol() {
  const qc = useQueryClient();
  return useMutation<KolView, Error, string>({
    mutationFn: (kolId: string) => addKol(kolId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kolKeys.all });
      qc.invalidateQueries({ queryKey: ['kol-reputation'] });
    },
  });
}
