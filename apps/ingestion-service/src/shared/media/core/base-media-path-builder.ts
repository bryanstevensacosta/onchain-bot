import * as path from 'node:path';
import { PathConfig } from '../types/media-metadata';
import { PathSanitizer } from '../utils/path-sanitizer';

/**
 * Abstract base class for media path building strategies.
 * 
 * Different contexts (crypto-news, ads) use different path conventions.
 * Subclasses implement specific patterns while inheriting common sanitization.
 * 
 * **Path Convention Examples**:
 * - Crypto-news: `uploads/crypto-news/media/{channelId}/{messageId}_{index}.{ext}`
 * - Ads: `uploads/crypto-news-ads/{adId}/{filename}`
 * 
 * **Cohesion Goal**: Centralize path sanitization, validation, and directory creation.
 * 
 * @example
 * ```ts
 * class CryptoNewsPathBuilder extends BaseMediaPathBuilder {
 *   buildMediaPath(channelId: string, messageId: number, index: number, ext: string): string {
 *     const sanitized = this.sanitizeId(channelId);
 *     const filename = `${messageId}_${index}${ext}`;
 *     return this.joinPaths(this.config.root, sanitized, filename);
 *   }
 * }
 * ```
 */
export abstract class BaseMediaPathBuilder {
  constructor(protected readonly config: PathConfig) {
    if (!config.root) {
      throw new Error('PathConfig.root is required');
    }
  }

  /**
   * Build a media file path for storage.
   * 
   * Subclasses implement this to define their specific path pattern.
   * Must return an absolute path ready for file I/O.
   * 
   * @returns Absolute path where the media file should be stored
   */
  public abstract buildMediaPath(...args: any[]): string;

  /**
   * Get the directory where media files for a given entity are stored.
   * 
   * Used for listing, cleanup, and directory creation operations.
   * 
   * @returns Absolute path to the entity's media directory
   */
  public abstract getMediaDirectory(...args: any[]): string;

  /**
   * Sanitize an ID (channelId, adId, etc.) for use in paths.
   * 
   * Delegates to PathSanitizer for consistent sanitization.
   * 
   * @param id - Raw ID string
   * @returns Sanitized ID safe for file paths
   */
  protected sanitizeId(id: string): string {
    return PathSanitizer.sanitizeId(id);
  }

  /**
   * Sanitize a filename for safe storage.
   * 
   * @param filename - Original filename
   * @returns Sanitized filename
   */
  protected sanitizeFilename(filename: string): string {
    return PathSanitizer.sanitizeFilename(filename);
  }

  /**
   * Join path components safely.
   * 
   * All components are sanitized before joining.
   * Returns an absolute path.
   * 
   * @param components - Path components to join
   * @returns Absolute path
   */
  protected joinPaths(...components: string[]): string {
    const sanitized = PathSanitizer.buildSafePath(...components);
    return path.join(...sanitized);
  }

  /**
   * Get the configured root directory for uploads.
   * 
   * @returns Absolute path to uploads root
   */
  public getRoot(): string {
    return this.config.root;
  }

  /**
   * Validate that a path is within the configured root directory.
   * 
   * Prevents path traversal attacks at validation time.
   * 
   * @param fullPath - Resolved absolute path to validate
   * @returns true if path is safe
   * @throws Error if path escapes root directory
   */
  protected validatePathIsWithinRoot(fullPath: string): void {
    if (!PathSanitizer.isWithinBase(this.config.root, fullPath)) {
      throw new Error(
        `Path traversal detected: "${fullPath}" is outside root "${this.config.root}"`,
      );
    }
  }
}
