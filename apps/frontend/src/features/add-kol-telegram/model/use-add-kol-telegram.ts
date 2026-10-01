import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kolKeys } from '@/entities/kol';
import type { KolView } from '@/entities/kol/model/types';
import { addKolTelegram } from '../api/add-kol-telegram-client';

export function useAddKolTelegram() {
  const qc = useQueryClient();
  return useMutation<KolView, Error, string>({
    mutationFn: (kolId: string) => addKolTelegram(kolId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kolKeys.all });
      qc.invalidateQueries({ queryKey: ['kol-reputation'] });
    },
  });
}
