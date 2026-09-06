import { httpDelete } from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';

export async function deleteCryptoNewsSource(
  channelId: string,
): Promise<{ success: boolean }> {
  return httpDelete<{ success: boolean }>(
    ENDPOINTS.cryptoNews.sources.delete(channelId),
  );
}
