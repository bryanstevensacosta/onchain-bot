import { httpPatch } from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { FeedSource } from '@/entities/feed/api/feed-queries';

export async function updateFeedSource(
  channelId: string,
  updates: { title?: string; handle?: string },
): Promise<FeedSource> {
  return httpPatch<{ title?: string; handle?: string }, FeedSource>(
    ENDPOINTS.feed.sources.update(channelId),
    updates,
  );
}
