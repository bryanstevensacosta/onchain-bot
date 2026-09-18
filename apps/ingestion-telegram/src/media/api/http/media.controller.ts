import {
  Controller,
  Get,
  Param,
  Res,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import * as path from 'path';
import {
  BaseMediaHttpServer,
  BaseFileSystemAdapter,
  MimeTypeResolver,
} from 'shared/media';
import { CryptoNewsPathBuilder } from 'media/infrastructure/crypto-news-path-builder';

/**
 * MediaController serves Telegram media files (photos/videos) via HTTP
 *
 * **Phase 2 Migration**: Now extends BaseMediaHttpServer to eliminate duplicated
 * HTTP serving logic. Inherits:
 * - Cache headers (Cache-Control, ETag)
 * - Content headers (Content-Type, Content-Length, Accept-Ranges)
 * - Stream piping with error handling
 * - Validation helpers
 *
 * Per Requirement 4.1, 4.2: Serves media downloaded by MTProto layer
 * Per Requirement 4.3: Returns 404 for missing files
 * Per Requirement 4.5: Implements aggressive caching (1 year max-age)
 * Per Invariant 5: Path-based URLs for debuggability
 *
 * Endpoint: GET /api/media/:channelId/:messageId/:index
 *
 * Media Storage Convention:
 * - Location: {UPLOADS_ROOT}/crypto-news/media/{channelId}/
 * - Pattern: {messageId}_{index}.{ext}
 * - Extensions: .jpg, .png, .webp, .gif, .mp4, .webm
 *
 * Security:
 * - Channel ID sanitized by path builder (path traversal safe)
 * - messageId/index validated via base class helpers
 *
 * @controller Handles /api/media routes
 */
@Controller('api/media')
export class MediaController extends BaseMediaHttpServer {
  private readonly logger = new Logger(MediaController.name);
  private readonly fileSystem: LocalFileSystemAdapter;
  private readonly pathBuilder: CryptoNewsPathBuilder;

  constructor(private readonly config: ConfigService) {
    super(); // Initialize base class

    // Load uploads root from config
    const appConfig = this.config.get('app');
    const uploadsRoot =
      appConfig?.uploads?.root || path.join(process.cwd(), 'uploads');
    const mediaRoot = path.join(uploadsRoot, 'crypto-news', 'media');

    this.fileSystem = new LocalFileSystemAdapter();
    this.pathBuilder = new CryptoNewsPathBuilder({
      root: mediaRoot,
      recursive: true,
    });

    this.logger.log(
      `MediaController initialized with uploads root: ${uploadsRoot}`,
    );
  }

  /**
   * Serve media file via HTTP
   *
   * **Phase 2**: Simplified to use base class helpers and path builder.
   * Most logic delegated to BaseMediaHttpServer.
   *
   * Per Requirement 4.1, 4.2: HTTP serving of downloaded media
   * Per Requirement 4.3: 404 for missing files
   * Per Requirement 4.5: Caching headers (1 year max-age)
   *
   * @param channelId - Telegram channel identifier
   * @param messageId - Telegram message ID
   * @param index - Media attachment index (0-based)
   * @param response - Express response object
   */
  @Get(':channelId/:messageId/:index')
  async serveMedia(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Param('index') index: string,
    @Res() response: Response,
  ): Promise<void> {
    try {
      // Validate parameters using base class helpers
      const msgId = this.validatePositiveInteger(messageId, 'messageId');
      const idx = this.validatePositiveInteger(index, 'index');
      const cleanChannelId = this.validateNonEmptyString(
        channelId,
        'channelId',
      );

      // Build media directory path
      const mediaDir = this.pathBuilder.getMediaDirectory(cleanChannelId);

      // Find file matching pattern: {messageId}_{index}.*
      const filePattern = new RegExp(`^${msgId}_${idx}\\.`);
      const matchingFiles = await this.fileSystem.findByPattern(
        mediaDir,
        filePattern,
      );

      if (matchingFiles.length === 0) {
        this.logger.warn(
          `Media file not found: ${cleanChannelId}:${msgId}:${idx}`,
        );
        this.sendNotFound(
          response,
          `Media file not found for ${cleanChannelId}:${msgId}:${idx}`,
        );
        return;
      }

      const filePath = matchingFiles[0]; // Take first match

      // Get file stats and stream
      const stat = await this.fileSystem.stat(filePath);
      const stream = this.fileSystem.stream(filePath);

      // Detect MIME type
      const extension = path.extname(filePath);
      const mimeType = MimeTypeResolver.getMimeTypeFromExtension(extension);

      // Stream file with cache headers (delegated to base class)
      await this.streamFile(filePath, stat, stream, response, {
        mimeType,
        cacheConfig: this.defaultCacheConfig, // 1 year cache
      });

      this.logger.debug(
        `Served media: ${cleanChannelId}:${msgId}:${idx} (${path.basename(filePath)}, ${stat.size} bytes, ${mimeType})`,
      );
    } catch (error) {
      if ((error as Error).message.includes('must be')) {
        // Validation error from base class helpers
        this.sendBadRequest(response, (error as Error).message);
        return;
      }

      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File or directory not found
        this.sendNotFound(response);
        return;
      }

      // Unexpected error
      this.logger.error(
        `Unexpected error serving media ${channelId}:${messageId}:${index}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      this.sendServerError(response, error as Error);
    }
  }
}

/**
 * Local file system adapter for MediaController.
 *
 * **Phase 2**: Simple wrapper around BaseFileSystemAdapter.
 * No customization needed - inherits all file I/O operations.
 */
class LocalFileSystemAdapter extends BaseFileSystemAdapter {
  // No customization needed - uses base class implementation
}
