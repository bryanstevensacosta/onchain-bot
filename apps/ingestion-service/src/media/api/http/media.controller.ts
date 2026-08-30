import { Controller, Get, Param, Res, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { promises as fs, createReadStream } from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';

/**
 * MediaController serves Telegram media files (photos/videos) via HTTP
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
 * - Channel ID sanitized by MTProto layer (path traversal safe)
 * - messageId/index validated as numeric
 * 
 * @controller Handles /api/media routes
 */
@Controller('api/media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);
  private readonly uploadsRoot: string;

  constructor(private readonly config: ConfigService) {
    // Load uploads root from config
    const appConfig = this.config.get('app');
    this.uploadsRoot = appConfig?.uploads?.root || path.join(process.cwd(), 'uploads');
    this.logger.log(`MediaController initialized with uploads root: ${this.uploadsRoot}`);
  }

  /**
   * Serve media file via HTTP
   * 
   * Per Requirement 4.1, 4.2: HTTP serving of downloaded media
   * Per Requirement 4.3: 404 for missing files
   * Per Requirement 4.5: Caching headers (1 year max-age)
   * 
   * @param channelId - Telegram channel identifier (sanitized)
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
      // Validate numeric params
      const msgId = parseInt(messageId, 10);
      const idx = parseInt(index, 10);
      
      if (isNaN(msgId) || isNaN(idx)) {
        response.status(400).json({
          error: 'Invalid parameters',
          message: 'messageId and index must be numeric',
        });
        return;
      }

      // Build media directory path
      // Per backend convention: uploads/crypto-news/media/{channelId}/
      const mediaDir = path.join(
        this.uploadsRoot,
        'crypto-news',
        'media',
        channelId,
      );

      // Find file matching pattern: {messageId}_{index}.*
      const filePattern = `${msgId}_${idx}.`;
      let files: string[];
      
      try {
        files = await fs.readdir(mediaDir);
      } catch (error) {
        // Directory doesn't exist = no media for this channel
        this.logger.warn(
          `Media directory not found: ${mediaDir} (channelId: ${channelId})`,
        );
        response.status(404).json({
          error: 'Media not found',
          message: `No media found for channel ${channelId}`,
        });
        return;
      }

      // Find matching file
      const matchedFile = files.find((f) => f.startsWith(filePattern));
      
      if (!matchedFile) {
        this.logger.warn(
          `Media file not found: ${channelId}:${msgId}:${idx} (pattern: ${filePattern})`,
        );
        response.status(404).json({
          error: 'Media not found',
          message: `Media file not found for ${channelId}:${msgId}:${idx}`,
        });
        return;
      }

      // Build full file path
      const filePath = path.join(mediaDir, matchedFile);
      
      // Get file stats
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch (error) {
        // File disappeared between readdir and stat (rare race condition)
        this.logger.error(
          `File stat failed: ${filePath} - ${(error as Error).message}`,
        );
        response.status(404).json({
          error: 'Media not found',
          message: 'Media file missing on disk',
        });
        return;
      }

      // Detect MIME type
      const mimeType = mime.lookup(filePath) || 'application/octet-stream';

      // Set response headers
      // Per Requirement 4.5: Aggressive caching (1 year)
      response.setHeader('Content-Type', mimeType);
      response.setHeader('Content-Length', stat.size);
      response.setHeader('ETag', `"${stat.mtime.getTime()}-${stat.size}"`);
      response.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
      response.setHeader('Accept-Ranges', 'bytes'); // Enable HTTP range support for video seeking

      // Stream file to response
      const readStream = createReadStream(filePath);
      
      readStream.on('error', (error) => {
        this.logger.error(
          `Stream error for ${filePath}: ${error.message}`,
        );
        if (!response.headersSent) {
          response.status(500).json({
            error: 'Internal server error',
            message: 'Failed to stream media file',
          });
        }
      });

      readStream.pipe(response);
      
      this.logger.debug(
        `Served media: ${channelId}:${msgId}:${idx} (${matchedFile}, ${stat.size} bytes, ${mimeType})`,
      );
    } catch (error) {
      this.logger.error(
        `Unexpected error serving media ${channelId}:${messageId}:${index}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      
      if (!response.headersSent) {
        response.status(500).json({
          error: 'Internal server error',
          message: 'Failed to serve media',
        });
      }
    }
  }
}
