import { httpDelete } from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';

export async function deleteFeedSource(
  channelId: string,
): Promise<{ success: boolean }> {
  return httpDelete<{ success: boolean }>(
    ENDPOINTS.feed.sources.delete(channelId),
  );
}
