import { httpGet } from '@/shared/api/http-client';

export interface CryptoNewsMediaView {
  readonly id: string;
  readonly index: number;
  readonly type: string;
  readonly url: string;
  readonly mimeType: string | null;
}

export interface CryptoNewsMessage {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly publishedAt: string;
  readonly ingestedAt: string;
  readonly media: ReadonlyArray<CryptoNewsMediaView>;
  readonly linkPreviewUrl: string | null;
  readonly linkPreviewTitle: string | null;
  readonly linkPreviewDescription: string | null;
  readonly linkPreviewSiteName: string | null;
  readonly formattingEntities?: ReadonlyArray<{
    readonly offset: number;
    readonly length: number;
    readonly type: string;
    readonly url?: string | null;
  }>;
  readonly groupedId?: string | null;
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
