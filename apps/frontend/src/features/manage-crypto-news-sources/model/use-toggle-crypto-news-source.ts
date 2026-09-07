import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleCryptoNewsSource } from '../api/toggle-crypto-news-source-client';
import { cryptoNewsKeys } from '@/entities/crypto-news';

export function useToggleCryptoNewsSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: toggleCryptoNewsSource,
    onSuccess: () => {
      // Invalidate sources list to refresh after toggle
      queryClient.invalidateQueries({ queryKey: cryptoNewsKeys.sources() });
    },
  });
}
