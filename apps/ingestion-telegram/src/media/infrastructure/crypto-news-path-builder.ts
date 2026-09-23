import * as path from 'node:path';
import { BaseMediaPathBuilder, PathConfig } from 'shared/media';

/**
 * Old on-disk segment (pre item 4) and new on-disk segment (post item 4).
 * Serving resolves by `{messageId}_{index}.*` glob under the channel dir,
 * so it is immune to the move; the janitor reads `file_path` and is not —
 * hence the prefix rewrite (migration + {@link rewriteMediaFilePathPrefix}).
 */
export const LEGACY_MEDIA_PATH_SEGMENT = 'crypto-news/media';
export const FEED_MEDIA_PATH_SEGMENT = 'feed/media';

/**
 * Rewrite a stored `file_path` from the legacy on-disk prefix to the feed
 * prefix. Mirrors the rename migration's `UPDATE` semantics exactly:
 *
 * - backslashes are normalized to `/` first (Windows-authored rows);
 * - ONLY paths containing the legacy segment are rewritten;
 * - everything else (empty string, already-new paths, foreign layouts) is
 *   returned byte-identical so no-match rows stay visible for remediation
 *   (re-move or manual rewrite + orphan scan in both directions).
 *
 * @param filePath - Stored `file_path` value (absolute or relative)
 * @returns Rewritten path, or the input unchanged when it does not match
 */
export function rewriteMediaFilePathPrefix(filePath: string): string {
  if (!filePath.includes('crypto-news')) {
    return filePath;
  }
  const normalized = filePath.replace(/\\/g, '/');
  if (!normalized.includes(`${LEGACY_MEDIA_PATH_SEGMENT}/`)) {
    return filePath;
  }
  return normalized.replaceAll(
    LEGACY_MEDIA_PATH_SEGMENT,
    FEED_MEDIA_PATH_SEGMENT,
  );
}

/**
 * Path builder for feed media files.
 *
 * Implements the convention:
 * `uploads/feed/media/{channelId}/{messageId}_{index}.{ext}`
 * (pre item 4: `uploads/crypto-news/media/...` — see
 * {@link LEGACY_MEDIA_PATH_SEGMENT}).
 *
 * Example:
 * - channelId: `-1001234567890`
 * - messageId: `167`
 * - index: `0`
 * - extension: `.jpg`
 * → `uploads/feed/media/-1001234567890/167_0.jpg`
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
