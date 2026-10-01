import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FeedSource } from '@/entities/feed/api/feed-queries';
import { updateFeedSource } from '../api/update-feed-source-client';

export function useUpdateFeedSource() {
  const qc = useQueryClient();
  return useMutation<
    FeedSource,
    Error,
    { channelId: string; title?: string; handle?: string }
  >({
    mutationFn: ({ channelId, ...updates }) =>
      updateFeedSource(channelId, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crypto-news', 'sources'] });
    },
  });
}
