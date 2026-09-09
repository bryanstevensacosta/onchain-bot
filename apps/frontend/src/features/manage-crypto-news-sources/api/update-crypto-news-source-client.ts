import { httpPatch } from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { CryptoNewsSource } from '@/entities/crypto-news/api/crypto-news-queries';

export async function updateCryptoNewsSource(
  channelId: string,
  updates: { title?: string; handle?: string },
): Promise<CryptoNewsSource> {
  return httpPatch<{ title?: string; handle?: string }, CryptoNewsSource>(
    ENDPOINTS.cryptoNews.sources.update(channelId),
    updates,
  );
}
