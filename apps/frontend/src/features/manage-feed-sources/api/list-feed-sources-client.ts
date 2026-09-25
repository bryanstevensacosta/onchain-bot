import { httpGet } from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { FeedSource } from '@/entities/feed/api/feed-queries';

export async function listFeedSources(): Promise<FeedSource[]> {
  return httpGet<FeedSource[]>(ENDPOINTS.feed.sources.list);
}
