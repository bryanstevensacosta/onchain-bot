/**
 * MessagePayload - SSE event payload for Telegram messages
 *
 * Per Invariant 1 (fix-1, ToS compliance):
 * - Raw Telegram text content is EXCLUDED from this payload
 * - Backend clients must fetch full message via backfill API if needed
 *
 * Per Invariant 5:
 * - Media URLs are path-based for debuggability: /api/media/:channelId/:messageId/:index
 *
 * This is the shape broadcasted to all backend clients via SSE.
 * Backend SSE adapter transforms this back to TelegramRawMessage format.
 */

/**
 * Media attachment reference in SSE payload
 */
export interface MediaPayload {
  type: 'photo' | 'video';
  index: number;
  url: string; // HTTP URL: /api/media/:channelId/:messageId/:index
  mimeType: string; // e.g., 'image/jpeg', 'video/mp4'
  fileSize: number; // Bytes
}

/**
 * Telegram entity (link, mention, hashtag)
 */
export interface EntityPayload {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

/**
 * Complete message payload for SSE broadcast
 *
 * Per Invariant 1: text/content field is EXCLUDED
 * Backend clients receive metadata only and can fetch full content separately
 */
export interface MessagePayload {
  /** Telegram channel identifier (e.g., "-1001234567890" or "@channelname") */
  peerId: string;

  /** Telegram message ID (monotonically increasing per channel) */
  messageId: number;

  /** ISO 8601 timestamp of message creation */
  occurredAt: string;

  /** Media attachments (photos/videos) with HTTP URLs */
  media: MediaPayload[];

  /** Text entities (links, mentions, hashtags) WITHOUT the actual text */
  entities?: EntityPayload[];

  /** Grouped media album ID (multiple messages share same groupedId) */
  groupedId?: string;

  /**
   * Message type discriminator for backend routing
   * - 'kol': Alpha call from KOL channel
   * - 'crypto-news': General market intel from news channel
   */
  messageType: 'kol' | 'crypto-news';
}
