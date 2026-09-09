import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api } from 'telegram';
import { TelegramClient } from 'telegram';
import * as path from 'node:path';
import { FloodWaitHandlerService } from 'telegram/shared/infrastructure/services/flood-wait-handler.service';
import {
  BaseTelegramMediaDownloader,
  BaseFileSystemAdapter,
  DownloadedMedia,
} from 'shared/media';
import { CryptoNewsPathBuilder } from 'media/infrastructure/crypto-news-path-builder';

/**
 * MediaDownloaderService - Downloads Telegram media to disk
 *
 * **Phase 2 Migration**: Now extends BaseTelegramMediaDownloader to eliminate
 * ~150 lines of duplicated download logic. Inherits:
 * - MIME type detection
 * - Buffer/file path handling
 * - Temp file cleanup
 * - Extension mapping
 *
 * Per Requirement 4.1: Synchronous media download at ingestion time
 * Per Requirement 4.2: MIME type detection from file extension
 * Per Requirement 4.3: File path sanitization against path traversal
 *
 * Responsibilities:
 * - Download photos/videos from Telegram via MTProto
 * - Save to disk at uploads/crypto-news/media/:channelId/:messageId_:index.ext
 * - Return absolute file path + MIME type + file size
 * - Handle FloodWait errors with exponential backoff (via override)
 */
@Injectable()
export class MediaDownloaderService extends BaseTelegramMediaDownloader {
  private readonly logger = new Logger(MediaDownloaderService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly floodWaitHandler: FloodWaitHandlerService,
  ) {
    // Initialize base class with file system adapter and path builder
    const appConfig = config.get('app');
    const uploadsRoot = appConfig?.uploads?.root || 'uploads';
    const mediaRoot = path.join(uploadsRoot, 'crypto-news', 'media');

    const fileSystem = new LocalFileSystemAdapter();
    const pathBuilder = new CryptoNewsPathBuilder({
      root: mediaRoot,
      recursive: true,
    });

    super(fileSystem, pathBuilder);
  }

  /**
   * Download a single media attachment from Telegram
   *
   * **Phase 2**: Now delegates to base class download() which handles:
   * - MIME detection
   * - Extension mapping
   * - Buffer/file path conversion
   * - Path building
   * - File writing
   *
   * @param client - Telegram client instance
   * @param channelId - Channel ID (sanitized by base class)
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
      this.logger.debug(
        `Downloading media: ${channelId}:${messageId}:${index}`,
      );

      // Delegate to base class (which calls our overridden downloadFromTelegram)
      const result = await super.download(
        client,
        channelId,
        messageId,
        index,
        media,
      );

      this.logger.log(
        `Downloaded media: ${channelId}:${messageId}:${index} (${result.fileSize} bytes) → ${result.filePath}`,
      );

      return result;
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
   * Override to add FloodWait retry logic.
   *
   * **Phase 2**: This is the only method we need to override to customize
   * the base class behavior. Everything else (MIME detection, path building,
   * file I/O) is handled by the base class.
   *
   * @param client - Telegram client
   * @param media - Media object to download
   * @returns Buffer or temp file path
   */
  protected async downloadFromTelegram(
    client: any,
    media: any,
  ): Promise<Buffer | string> {
    return await this.floodWaitHandler.withRetry(
      `media-download-${Date.now()}`,
      async () => await client.downloadMedia(media, {}),
    );
  }

  /**
   * Override to build crypto-news specific paths.
   *
   * @param channelId - Channel ID
   * @param messageId - Message ID
   * @param index - Media index
   * @param extension - File extension
   * @returns Absolute path
   */
  protected buildStoragePath(
    channelId: string,
    messageId: number,
    index: number,
    extension: string,
  ): string {
    // Type-safe access to our concrete path builder
    const pathBuilder = this.pathBuilder as CryptoNewsPathBuilder;
    return pathBuilder.buildMediaPath(channelId, messageId, index, extension);
  }
}

/**
 * Local file system adapter for MediaDownloaderService.
 *
 * **Phase 2**: Simple wrapper around BaseFileSystemAdapter.
 * No customization needed - inherits all file I/O operations.
 */
class LocalFileSystemAdapter extends BaseFileSystemAdapter {
  // No customization needed - uses base class implementation
}
