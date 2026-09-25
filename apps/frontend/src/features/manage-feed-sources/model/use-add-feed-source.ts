import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedKeys } from '@/entities/feed';
import type { FeedSource } from '@/entities/feed/api/feed-queries';
import { addFeedSource } from '../api/add-feed-source-client';

export function useAddFeedSource() {
  const qc = useQueryClient();
  return useMutation<FeedSource, Error, { channelId: string; title?: string }>({
    mutationFn: (input) => addFeedSource(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: feedKeys.all });
    },
  });
}
