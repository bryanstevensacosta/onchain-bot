import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cryptoNewsKeys } from '@/entities/crypto-news';
import type { CryptoNewsSource } from '@/entities/crypto-news/api/crypto-news-queries';
import { addCryptoNewsSource } from '../api/add-crypto-news-source-client';

export function useAddCryptoNewsSource() {
  const qc = useQueryClient();
  return useMutation<CryptoNewsSource, Error, { channelId: string }>({
    mutationFn: (input) => addCryptoNewsSource(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cryptoNewsKeys.all });
    },
  });
}
