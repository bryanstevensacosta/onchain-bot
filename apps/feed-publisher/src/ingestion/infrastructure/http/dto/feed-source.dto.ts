import type { FeedSource } from '../../../domain/ports/ingestion-client.port';

/**
 * Raw feed source row as served by
 * `GET /api/feed/sources?type=crypto-news`.
 * Unknown extra fields are tolerated; only the typed subset is kept.
 */
export interface RawFeedSourceDto {
  channelId?: unknown;
  channel_id?: unknown;
  peerId?: unknown;
  title?: unknown;
  handle?: unknown;
  username?: unknown;
  type?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function toFeedSource(
  raw: RawFeedSourceDto,
): FeedSource | null {
  const channelId =
    asString(raw.channelId) ?? asString(raw.channel_id) ?? asString(raw.peerId);
  if (!channelId) {
    return null;
  }
  return {
    channelId,
    title: asString(raw.title),
    handle: asString(raw.handle) ?? asString(raw.username),
    type: asString(raw.type) ?? 'crypto-news',
  };
}
