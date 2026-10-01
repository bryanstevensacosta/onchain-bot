import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleFeedSource } from '../api/toggle-feed-source-client';
import { feedKeys } from '@/entities/feed';

export function useToggleFeedSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: toggleFeedSource,
    onSuccess: () => {
      // Invalidate sources list to refresh after toggle
      queryClient.invalidateQueries({ queryKey: feedKeys.sources() });
    },
  });
}
