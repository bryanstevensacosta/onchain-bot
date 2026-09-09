/**
 * Shared media types across ingestion-service and backend.
 *
 * These interfaces define the contract for media download, storage,
 * and serving operations. Both crypto-news (ingestion) and ads (backend)
 * components use these types for consistency.
 */

/**
 * Result of a media download operation.
 * Contains absolute file path, detected MIME type, and file size.
 */
export interface DownloadedMedia {
  /** Absolute path where the file was saved */
  readonly filePath: string;

  /** MIME type detected from extension or Telegram metadata (null if unknown) */
  readonly mimeType: string | null;

  /** File size in bytes */
  readonly fileSize: number;
}

/**
 * Media attachment metadata for SSE payloads and HTTP responses.
 * Provides URL reference, type, and metadata for frontend consumption.
 */
export interface MediaPayload {
  /** Type of media content */
  readonly type: 'photo' | 'video';

  /** Index in grouped media (0-based) */
  readonly index: number;

  /** Public URL to fetch this media file */
  readonly url: string;

  /** MIME type (e.g., 'image/jpeg', 'video/mp4') */
  readonly mimeType: string | null;

  /** File size in bytes */
  readonly fileSize: number;
}

/**
 * Configuration for media path building strategies.
 * Different contexts (crypto-news, ads) use different path conventions.
 */
export interface PathConfig {
  /** Root directory for uploads (e.g., 'uploads/crypto-news/media') */
  readonly root: string;

  /** Whether to create directories recursively */
  readonly recursive: boolean;
}

/**
 * Configuration for HTTP cache headers when serving media.
 */
export interface CacheConfig {
  /** Cache-Control max-age in seconds (default: 1 year) */
  readonly maxAge: number;

  /** Whether to include ETag header */
  readonly useETag: boolean;

  /** Whether to support range requests (Accept-Ranges) */
  readonly supportRanges: boolean;
}

/**
 * Result of a media cleanup operation.
 */
export interface CleanupResult {
  /** Number of files successfully deleted */
  readonly deleted: number;

  /** Error messages for failed deletions */
  readonly errors: string[];
}
