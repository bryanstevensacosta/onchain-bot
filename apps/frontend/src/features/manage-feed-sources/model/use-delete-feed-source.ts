import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteFeedSource } from '../api/delete-feed-source-client';

export function useDeleteFeedSource() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (channelId) => deleteFeedSource(channelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crypto-news', 'sources'] });
    },
  });
}
