import { httpPost } from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { FeedSource } from '@/entities/feed/api/feed-queries';

export async function addFeedSource(input: {
  channelId: string;
  title?: string;
}): Promise<FeedSource> {
  return httpPost<{ channelId: string; title?: string }, FeedSource>(
    ENDPOINTS.feed.sources.add,
    input,
  );
}
