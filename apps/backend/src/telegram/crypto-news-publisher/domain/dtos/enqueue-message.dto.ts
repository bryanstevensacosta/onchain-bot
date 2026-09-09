import type { Keyword } from '../entities/keyword.entity';

/**
 * DTO for enqueuing crypto-news messages to the publisher queue.
 *
 * This DTO represents a crypto-news message that has been:
 * 1. Fetched from ingestion-service (RAW content)
 * 2. Filtered by ContentFilterService (regex transforms applied)
 * 3. Matched against keywords (matchedKeywords embedded)
 *
 * Used internally by the publisher module to decouple from ingestion-service
 * domain entities (Strategy 1: Pure DTO pattern).
 *
 * Architectural note: This DTO is the boundary between crypto-news-integration
 * (matching/filtering) and crypto-news-publisher (queue/publish). The scheduler
 * maps HTTP DTOs → EnqueueMessageDto → Use case accepts this shape.
 */
export interface EnqueueMessageDto {
  /**
   * Telegram channel ID (format: "-1001234567890")
   */
  readonly channelId: string;

  /**
   * Telegram message ID within the channel
   */
  readonly messageId: number;

  /**
   * FILTERED content (after ContentFilterService regex transforms)
   * This is NOT raw content from ingestion-service.
   */
  readonly content: string;

  /**
   * When the message was published in the source channel (Date object)
   * Converted from ISO string by scheduler.
   */
  readonly publishedAt: Date;

  /**
   * When the message was ingested by ingestion-service (Date object)
   * Converted from ISO string by scheduler.
   */
  readonly ingestedAt: Date;

  /**
   * Media attachments (photos, videos, documents)
   * Empty array if no media.
   */
  readonly media: EnqueueMessageMediaDto[];

  /**
   * Keywords that matched this message (embedded at enqueue time)
   * Used by publisher to select LLM template (if keyword has templateId override).
   */
  readonly matchedKeywords: Keyword[];
}

/**
 * Media attachment for a crypto-news message.
 *
 * Contains resolved file paths (not URLs) since backend reads media
 * files from ingestion-service uploads directory.
 */
export interface EnqueueMessageMediaDto {
  /**
   * Zero-based index of the media item in the message's media group
   */
  readonly index: number;

  /**
   * Media type (photo | video | document)
   */
  readonly type: 'photo' | 'video' | 'document';

  /**
   * Resolved file path for reading the media file
   * Format: relative or absolute path to ingestion-service uploads/
   */
  readonly filePath: string;

  /**
   * MIME type detected by ingestion-service (optional)
   * Example: "image/jpeg", "video/mp4", "application/pdf"
   */
  readonly mimeType?: string;

  /**
   * File size in bytes (optional)
   */
  readonly fileSize?: number;
}
