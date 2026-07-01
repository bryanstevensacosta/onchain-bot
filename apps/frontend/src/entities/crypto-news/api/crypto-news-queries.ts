import { httpGet } from '@/shared/api/http-client';

export interface CryptoNewsMessage {
  id: string;
  channelId: string;
  messageId: number;
  title: string | null;
  content: string;
  publishedAt: string;
  ingestedAt: string;
}

export interface CryptoNewsSource {
  channelId: string;
  handle: string | null;
  title: string;
  isActive: boolean;
  lifecycleStatus: string;
  addedAt: string;
}

export const cryptoNewsKeys = {
  all: ['crypto-news'] as const,
  messages: (limit: number, channelId?: string) =>
    [...cryptoNewsKeys.all, 'messages', { limit, channelId }] as const,
  sources: () => [...cryptoNewsKeys.all, 'sources'] as const,
};

export async function fetchCryptoNewsMessages(
  limit = 50,
  channelId?: string,
): Promise<ReadonlyArray<CryptoNewsMessage>> {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (channelId) qs.set('channelId', channelId);
  return httpGet<ReadonlyArray<CryptoNewsMessage>>(
    `/crypto-news/messages?${qs.toString()}`,
  );
}

export async function fetchCryptoNewsSources(): Promise<
  ReadonlyArray<CryptoNewsSource>
> {
  return httpGet<ReadonlyArray<CryptoNewsSource>>('/crypto-news/sources');
}
