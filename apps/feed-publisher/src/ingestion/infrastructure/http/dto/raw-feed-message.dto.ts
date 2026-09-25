import type { FeedIngestedMessage } from '../../../domain/ports/ingestion-client.port';

/**
 * Raw feed message row as served by
 * `GET /api/feed/messages?type=crypto-news`.
 */
export interface RawFeedMessageDto {
  channelId?: unknown;
  channel_id?: unknown;
  peerId?: unknown;
  messageId?: unknown;
  message_id?: unknown;
  id?: unknown;
  text?: unknown;
  content?: unknown;
  occurredAt?: unknown;
  occurred_at?: unknown;
  ingestedAt?: unknown;
  ingested_at?: unknown;
  messageType?: unknown;
  message_type?: unknown;
}

/** Top-level SSE frame. The kind marker (`message:telegram`) is top-level; the feed-type marker lives inside `data`. */
export interface SseFrame {
  type?: unknown;
  event?: unknown;
  data?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickChannelId(raw: RawFeedMessageDto): string | null {
  const v =
    typeof raw.channelId === 'string'
      ? raw.channelId
      : typeof raw.channel_id === 'string'
        ? raw.channel_id
        : typeof raw.peerId === 'string'
          ? raw.peerId
          : null;
  return v && v.length > 0 ? v : null;
}

function pickMessageId(raw: RawFeedMessageDto): number | null {
  return (
    asNumber(raw.messageId) ?? asNumber(raw.message_id) ?? asNumber(raw.id)
  );
}

function pickOccurredAt(raw: RawFeedMessageDto): string {
  const v =
    typeof raw.occurredAt === 'string'
      ? raw.occurredAt
      : typeof raw.occurred_at === 'string'
        ? raw.occurred_at
        : typeof raw.ingestedAt === 'string'
          ? raw.ingestedAt
          : typeof raw.ingested_at === 'string'
            ? raw.ingested_at
            : null;
  return v ?? new Date().toISOString();
}

/**
 * True when the payload carries the feed marker. Anything else
 * (missing data, missing marker, other marker) is NOT a feed frame.
 */
export function isFeedData(data: unknown): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const record = data as Record<string, unknown>;
  return (
    record['messageType'] === 'crypto-news' ||
    record['message_type'] === 'crypto-news'
  );
}

/** True for a top-level `message:telegram` frame whose `data` is feed-marked. */
export function isFeedFrame(frame: unknown): boolean {
  if (!frame || typeof frame !== 'object') {
    return false;
  }
  const record = frame as SseFrame;
  const kind =
    typeof record.type === 'string'
      ? record.type
      : typeof record.event === 'string'
        ? record.event
        : null;
  if (kind !== 'message:telegram') {
    return false;
  }
  return isFeedData(record.data);
}

export function toFeedMessage(
  raw: RawFeedMessageDto,
): FeedIngestedMessage | null {
  const channelId = pickChannelId(raw);
  const messageId = pickMessageId(raw);
  if (!channelId || messageId === null) {
    return null;
  }
  const messageType =
    typeof raw.messageType === 'string'
      ? raw.messageType
      : typeof raw.message_type === 'string'
        ? raw.message_type
        : 'crypto-news';
  return {
    channelId,
    messageId,
    text: asString(raw.text) || asString(raw.content),
    occurredAt: pickOccurredAt(raw),
    messageType,
  };
}
