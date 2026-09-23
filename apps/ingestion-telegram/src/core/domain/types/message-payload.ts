/**
 * MessagePayload - SSE event payload for Telegram messages
 *
 * Per ADR docs/architecture/adr-kol-raw-text.md (Q1-B amendment):
 * - Raw Telegram text IS carried in `text` for BOTH types (kol + crypto-news)
 * - Backend-internal ToS boundary UNCHANGED: `KolMessageIngestedEvent`
 *   (`telegram.message.ingested`) still carries NO text (fix-1 holds)
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
 * Per ADR adr-kol-raw-text.md (Q1-B): text carried for BOTH types.
 * Backend clients receive full text + metadata; the backend-internal event
 * bus still excludes raw text (fix-1).
 */
export interface MessagePayload {
  /** Telegram channel identifier (e.g., "-1001234567890" or "@channelname") */
  peerId: string;

  /** Telegram message ID (monotonically increasing per channel) */
  messageId: number;

  /** ISO 8601 timestamp of message creation */
  occurredAt: string;

  /**
   * Raw message text content (BOTH types, Q1-B — missing → '').
   * - KOL: alpha-call text, persisted RAW (type='kol') + carried here
   * - Crypto-news: opaque content, stored as-is
   */
  text?: string;

  /** Media attachments (photos/videos) with HTTP URLs */
  media: MediaPayload[];

  /** Text entities (links, mentions, hashtags) */
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
