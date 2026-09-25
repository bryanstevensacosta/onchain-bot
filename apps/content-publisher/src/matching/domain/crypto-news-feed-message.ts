/**
 * Typed crypto-only feed message (todo 3 deliverable: typed crypto-only fetches).
 *
 * `messageType` is pinned to the `'crypto-news'` literal at the type
 * level: producers type their rows with this interface and consumers
 * drop any row whose runtime marker differs (client-side P10 guard in
 * FilteredCryptoNewsService). Media items are photo/video only for the
 * `hasMedia` signal; link previews never count.
 */
export type CryptoNewsFeedMediaType = 'photo' | 'video' | 'document';

export interface CryptoNewsFeedMedia {
  readonly index: number;
  readonly type: CryptoNewsFeedMediaType;
  readonly url?: string;
  readonly filePath?: string;
  readonly mimeType?: string | null;
  readonly fileSize?: number | null;
  readonly ownerMessageId?: number;
}

export interface CryptoNewsFeedMessage {
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly publishedAt: string;
  readonly ingestedAt: string;
  readonly media: ReadonlyArray<CryptoNewsFeedMedia>;
  readonly groupedId: string | null;
  readonly messageType: 'crypto-news';
}
