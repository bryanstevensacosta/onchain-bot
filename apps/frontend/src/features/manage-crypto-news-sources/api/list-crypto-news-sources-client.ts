import { httpGet } from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { CryptoNewsSource } from '@/entities/crypto-news/api/crypto-news-queries';

export async function listCryptoNewsSources(): Promise<CryptoNewsSource[]> {
  return httpGet<CryptoNewsSource[]>(ENDPOINTS.cryptoNews.sources.list);
}
