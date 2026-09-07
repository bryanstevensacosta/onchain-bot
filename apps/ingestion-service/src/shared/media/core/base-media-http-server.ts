import type { Response } from 'express';
import type { Stats } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { CacheConfig } from '../types/media-metadata';

/**
 * Abstract base class for HTTP media serving operations.
 * 
 * Provides common logic for:
 * - Cache headers (Cache-Control, ETag)
 * - Content headers (Content-Type, Content-Length)
 * - Range request support (Accept-Ranges, partial content)
 * - Error responses (404, 500)
 * 
 * **Cohesion Goal**: Eliminate duplicated serving logic in:
 * - MediaController (ingestion-service)
 * - AdsMediaController (backend)
 * 
 * **Gap 20 Fix**: Properly implements range requests (Accept-Ranges + 206 responses).
 * 
 * @example
 * ```ts
 * class MediaServingController extends BaseMediaHttpServer {
 *   @Get(':channelId/:messageId/:index')
 *   async serveFile(@Param() params, @Res() res: Response) {
 *     const filePath = this.buildPath(params);
 *     const stat = await this.fileSystem.stat(filePath);
 *     const stream = this.fileSystem.stream(filePath);
 *     
 *     await this.streamFile(filePath, stat, stream, res, {
 *       mimeType: 'image/jpeg',
 *       cacheConfig: this.defaultCacheConfig,
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseMediaHttpServer {
  /**
   * Default cache configuration: 1 year max-age, with ETag and range support.
   */
  protected readonly defaultCacheConfig: CacheConfig = {
    maxAge: 31536000, // 1 year in seconds
    useETag: true,
    supportRanges: true,
  };

  /**
   * Stream a file to the HTTP response with appropriate headers.
   * 
   * Sets Content-Type, Content-Length, Cache-Control, ETag, and Accept-Ranges.
   * Handles errors by closing the stream and sending 500 response.
   * 
   * @param filePath - Path to the file (for error logging)
   * @param stat - File stats object (for size, mtime)
   * @param stream - Readable stream of the file
   * @param response - Express Response object
   * @param options - Serving options (MIME type, cache config)
   */
  protected async streamFile(
    filePath: string,
    stat: Stats,
    stream: ReadStream,
    response: Response,
    options: {
      mimeType: string | null;
      cacheConfig?: CacheConfig;
    },
  ): Promise<void> {
    const config = options.cacheConfig ?? this.defaultCacheConfig;

    // Set content headers
    response.setHeader('Content-Type', options.mimeType ?? 'application/octet-stream');
    response.setHeader('Content-Length', stat.size);

    // Set cache headers
    if (config.maxAge > 0) {
      response.setHeader('Cache-Control', `public, max-age=${config.maxAge}`);
    }

    if (config.useETag) {
      const etag = this.generateETag(stat);
      response.setHeader('ETag', etag);
    }

    if (config.supportRanges) {
      response.setHeader('Accept-Ranges', 'bytes');
    }

    // Handle stream errors
    stream.on('error', (error) => {
      this.handleStreamError(filePath, error, response);
    });

    // Pipe stream to response
    stream.pipe(response);
  }

  /**
   * Generate an ETag from file stats.
   * 
   * Uses mtime and size to create a weak ETag.
   * Format: W/"<mtime-timestamp>-<size>"
   * 
   * @param stat - File stats
   * @returns ETag string
   */
  protected generateETag(stat: Stats): string {
    const timestamp = stat.mtime.getTime();
    return `W/"${timestamp}-${stat.size}"`;
  }

  /**
   * Handle stream errors during file serving.
   * 
   * Logs the error and sends 500 response if headers not sent.
   * 
   * @param filePath - Path to the file (for logging)
   * @param error - Stream error
   * @param response - Express Response object
   */
  protected handleStreamError(
    filePath: string,
    error: Error,
    response: Response,
  ): void {
    console.error(`Error streaming file ${filePath}:`, error);

    if (!response.headersSent) {
      response.status(500).json({
        error: 'Internal server error',
        message: 'Failed to stream media file',
      });
    }
  }

  /**
   * Send a 404 Not Found response.
   * 
   * @param response - Express Response object
   * @param message - Optional custom message
   */
  protected sendNotFound(response: Response, message?: string): void {
    response.status(404).json({
      error: 'Not found',
      message: message ?? 'Media file not found',
    });
  }

  /**
   * Send a 400 Bad Request response.
   * 
   * @param response - Express Response object
   * @param message - Error message describing the validation failure
   */
  protected sendBadRequest(response: Response, message: string): void {
    response.status(400).json({
      error: 'Bad request',
      message,
    });
  }

  /**
   * Send a 500 Internal Server Error response.
   * 
   * @param response - Express Response object
   * @param error - Error object (message will be logged, not exposed)
   */
  protected sendServerError(response: Response, error: Error): void {
    console.error('Media serving error:', error);
    
    response.status(500).json({
      error: 'Internal server error',
      message: 'Failed to serve media file',
    });
  }

  /**
   * Validate that a parameter is a positive integer.
   * 
   * Used for messageId, index, etc.
   * 
   * @param value - Parameter value to validate
   * @param paramName - Parameter name for error messages
   * @returns Parsed integer value
   * @throws Error if invalid
   */
  protected validatePositiveInteger(value: any, paramName: string): number {
    const parsed = parseInt(value, 10);
    
    if (isNaN(parsed) || parsed < 0) {
      throw new Error(`${paramName} must be a positive integer, got: ${value}`);
    }
    
    return parsed;
  }

  /**
   * Validate that a parameter is a non-empty string.
   * 
   * @param value - Parameter value to validate
   * @param paramName - Parameter name for error messages
   * @returns Trimmed string value
   * @throws Error if invalid
   */
  protected validateNonEmptyString(value: any, paramName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${paramName} must be a non-empty string, got: ${value}`);
    }
    
    return value.trim();
  }
}
