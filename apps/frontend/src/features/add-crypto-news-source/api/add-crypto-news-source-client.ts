import { httpPost } from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { CryptoNewsSource } from '@/entities/crypto-news/api/crypto-news-queries';

export async function addCryptoNewsSource(input: {
  channelId: string;
}): Promise<CryptoNewsSource> {
  return httpPost<{ channelId: string }, CryptoNewsSource>(
    ENDPOINTS.cryptoNews.sources.add,
    input,
  );
}
