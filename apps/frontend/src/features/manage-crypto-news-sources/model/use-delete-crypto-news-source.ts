import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCryptoNewsSource } from '../api/delete-crypto-news-source-client';

export function useDeleteCryptoNewsSource() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (channelId) => deleteCryptoNewsSource(channelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crypto-news', 'sources'] });
    },
  });
}
