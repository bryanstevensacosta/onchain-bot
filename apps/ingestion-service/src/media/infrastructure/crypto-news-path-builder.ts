import * as path from 'node:path';
import { BaseMediaPathBuilder, PathConfig } from 'shared/media';

/**
 * Path builder for crypto-news media files.
 *
 * Implements the convention:
 * `uploads/crypto-news/media/{channelId}/{messageId}_{index}.{ext}`
 *
 * Example:
 * - channelId: `-1001234567890`
 * - messageId: `167`
 * - index: `0`
 * - extension: `.jpg`
 * → `uploads/crypto-news/media/-1001234567890/167_0.jpg`
 *
 * **Phase 2 Migration**: Replaces duplicated path logic in MediaDownloaderService.
 */
export class CryptoNewsPathBuilder extends BaseMediaPathBuilder {
  constructor(config: PathConfig) {
    super(config);
  }

  /**
   * Build the full path for a crypto-news media file.
   *
   * @param channelId - Telegram channel ID
   * @param messageId - Message ID
   * @param index - Media index in grouped media (0-based)
   * @param extension - File extension with leading dot (e.g., '.jpg')
   * @returns Absolute path to the media file
   *
   * @example
   * ```ts
   * builder.buildMediaPath('-1001234567890', 167, 0, '.jpg');
   * // → /app/uploads/crypto-news/media/-1001234567890/167_0.jpg
   * ```
   */
  public buildMediaPath(
    channelId: string,
    messageId: number,
    index: number,
    extension: string,
  ): string {
    // Sanitize channel ID (remove non-alphanumeric except hyphens)
    const sanitizedChannelId = this.sanitizeId(channelId);

    // Build filename: {messageId}_{index}{extension}
    const filename = `${messageId}_${index}${extension}`;

    // Join: root / channelId / filename
    // NOTE: Use path.join directly instead of joinPaths to avoid over-sanitization
    const filePath = path.join(this.config.root, sanitizedChannelId, filename);

    // Validate path is within root (security check)
    this.validatePathIsWithinRoot(filePath);

    return filePath;
  }

  /**
   * Get the directory where media for a specific channel is stored.
   *
   * Used for listing, cleanup, and directory creation operations.
   *
   * @param channelId - Telegram channel ID
   * @returns Absolute path to the channel's media directory
   *
   * @example
   * ```ts
   * builder.getMediaDirectory('-1001234567890');
   * // → /app/uploads/crypto-news/media/-1001234567890
   * ```
   */
  public getMediaDirectory(channelId: string): string {
    const sanitizedChannelId = this.sanitizeId(channelId);
    // NOTE: Use path.join directly instead of joinPaths to avoid over-sanitization
    const directory = path.join(this.config.root, sanitizedChannelId);
    this.validatePathIsWithinRoot(directory);
    return directory;
  }

  /**
   * Parse a file path to extract channel ID, message ID, and index.
   *
   * Useful for cleanup and reverse lookups.
   * Returns null if path doesn't match the expected pattern.
   *
   * @param filePath - Full or relative file path
   * @returns Parsed components or null
   *
   * @example
   * ```ts
   * builder.parseMediaPath('/uploads/crypto-news/media/123/167_0.jpg');
   * // → { channelId: '123', messageId: 167, index: 0, extension: '.jpg' }
   * ```
   */
  public parseMediaPath(filePath: string): {
    channelId: string;
    messageId: number;
    index: number;
    extension: string;
  } | null {
    const filename = path.basename(filePath);
    const directory = path.basename(path.dirname(filePath));
    const extension = path.extname(filename);

    // Pattern: {messageId}_{index}{extension}
    const match = filename.match(/^(\d+)_(\d+)\./);
    if (!match) {
      return null;
    }

    return {
      channelId: directory,
      messageId: parseInt(match[1], 10),
      index: parseInt(match[2], 10),
      extension,
    };
  }
}
