import { httpPatch } from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';

export async function toggleFeedSource(
  channelId: string,
): Promise<{ channelId: string; isActive: boolean }> {
  return httpPatch<
    Record<string, never>,
    { channelId: string; isActive: boolean }
  >(ENDPOINTS.feed.sources.toggle(channelId), {});
}
