import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CryptoNewsSource } from '@/entities/crypto-news/api/crypto-news-queries';
import { updateCryptoNewsSource } from '../api/update-crypto-news-source-client';

export function useUpdateCryptoNewsSource() {
  const qc = useQueryClient();
  return useMutation<
    CryptoNewsSource,
    Error,
    { channelId: string; title?: string; handle?: string }
  >({
    mutationFn: ({ channelId, ...updates }) =>
      updateCryptoNewsSource(channelId, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crypto-news', 'sources'] });
    },
  });
}
