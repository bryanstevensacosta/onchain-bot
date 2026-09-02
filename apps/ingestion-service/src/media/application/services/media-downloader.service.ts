import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api } from 'telegram';
import { TelegramClient } from 'telegram';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { FloodWaitHandlerService } from 'telegram/shared/infrastructure/services/flood-wait-handler.service';

export interface DownloadedMedia {
  readonly filePath: string;
  readonly mimeType: string | null;
  readonly fileSize: number;
}

/**
 * MediaDownloaderService - Downloads Telegram media to disk
 *
 * Per Requirement 4.1: Synchronous media download at ingestion time
 * Per Requirement 4.2: MIME type detection from file extension
 * Per Requirement 4.3: File path sanitization against path traversal
 *
 * Responsibilities:
 * - Download photos/videos from Telegram via MTProto
 * - Save to disk at uploads/crypto-news/media/:channelId/:messageId_:index.ext
 * - Return absolute file path + MIME type + file size
 * - Handle FloodWait errors with exponential backoff
 */
@Injectable()
export class MediaDownloaderService {
  private readonly logger = new Logger(MediaDownloaderService.name);
  private readonly uploadsRoot: string;
  private readonly mediaPath: string;

  constructor(
    private readonly config: ConfigService,
    private readonly floodWaitHandler: FloodWaitHandlerService,
  ) {
    const appConfig = this.config.get('app');
    this.uploadsRoot = appConfig?.uploads?.root || 'uploads';
    this.mediaPath = path.join(this.uploadsRoot, 'crypto-news', 'media');
  }

  /**
   * Download a single media attachment from Telegram
   *
   * @param client - Telegram client instance
   * @param channelId - Sanitized channel ID
   * @param messageId - Message ID
   * @param index - Media index within message
   * @param media - Telegram media object (MessageMediaPhoto or MessageMediaDocument)
   * @returns Metadata about downloaded file
   */
  async download(
    client: TelegramClient,
    channelId: string,
    messageId: number,
    index: number,
    media: Api.MessageMediaPhoto | Api.MessageMediaDocument,
  ): Promise<DownloadedMedia> {
    try {
      // Sanitize channelId against path traversal
      const sanitizedChannelId = this.sanitizeChannelId(channelId);

      // Determine file extension from media type
      const extension = this.getExtension(media);

      // Build file path
      const channelDir = path.join(this.mediaPath, sanitizedChannelId);
      await fs.mkdir(channelDir, { recursive: true });

      const filename = `${messageId}_${index}${extension}`;
      const filePath = path.join(channelDir, filename);

      // Download with FloodWait handling
      const result = await this.floodWaitHandler.withRetry(
        `media-download-${channelId}-${messageId}-${index}`,
        async () => {
          this.logger.debug(
            `Downloading media: ${channelId}:${messageId}:${index}`,
          );
          return await client.downloadMedia(media, {});
        },
      );

      // downloadMedia returns Buffer | string (path) depending on options
      let buffer: Buffer;
      if (typeof result === 'string') {
        // If it returned a path, read the file
        buffer = await fs.readFile(result);
        await fs.unlink(result); // Clean up temp file
      } else if (Buffer.isBuffer(result)) {
        buffer = result;
      } else {
        throw new Error('Downloaded media is neither Buffer nor string path');
      }

      if (!buffer || buffer.length === 0) {
        throw new Error('Downloaded buffer is empty');
      }

      // Write to disk
      await fs.writeFile(filePath, buffer);

      const mimeType = this.getMimeType(extension);
      const fileSize = buffer.length;

      this.logger.log(
        `Downloaded media: ${channelId}:${messageId}:${index} (${fileSize} bytes) → ${filePath}`,
      );

      return {
        filePath: path.resolve(filePath), // Return absolute path
        mimeType,
        fileSize,
      };
    } catch (error) {
      this.logger.error(
        `Failed to download media ${channelId}:${messageId}:${index}: ${
          (error as Error).message
        }`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Sanitize channel ID against path traversal attacks
   */
  private sanitizeChannelId(channelId: string): string {
    // Remove any path separators and keep only alphanumeric + dash
    return channelId.replace(/[^a-zA-Z0-9\-]/g, '');
  }

  /**
   * Get file extension from media type
   */
  private getExtension(
    media: Api.MessageMediaPhoto | Api.MessageMediaDocument,
  ): string {
    if (media instanceof Api.MessageMediaPhoto) {
      return '.jpg'; // Telegram photos are typically JPEG
    }

    if (media instanceof Api.MessageMediaDocument && media.document) {
      const doc = media.document as Api.Document;
      // Try to get extension from MIME type or attributes
      if (doc.mimeType) {
        const mimeMap: Record<string, string> = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'image/webp': '.webp',
          'video/mp4': '.mp4',
          'video/webm': '.webm',
        };
        return mimeMap[doc.mimeType] || '.bin';
      }
    }

    return '.bin';
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(extension: string): string | null {
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    };
    return mimeMap[extension] || null;
  }
}
