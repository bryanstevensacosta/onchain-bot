import { readFile, unlink } from 'node:fs/promises';
import type { DownloadedMedia } from '../types/media-metadata';
import { MimeTypeResolver } from '../utils/mime-type-resolver';
import { BaseFileSystemAdapter } from './base-file-system-adapter';
import { BaseMediaPathBuilder } from './base-media-path-builder';

/**
 * Abstract base class for downloading media from Telegram MTProto.
 * 
 * Encapsulates the common pattern:
 * 1. Call `client.downloadMedia(media, {})`
 * 2. Handle result (Buffer or temp file path)
 * 3. Detect MIME type from Telegram metadata
 * 4. Determine file extension
 * 5. Build final storage path
 * 6. Write to permanent location
 * 7. Return metadata (path, MIME, size)
 * 
 * **Cohesion Goal**: Eliminate ~150 lines of EXACT duplication between:
 * - MediaDownloaderService (ingestion-service)
 * - MtprotoMediaDownloader (backend) ← LEGACY, to be removed
 * 
 * **Template Method Pattern**: Subclasses override path building
 * while inheriting download + retry + cleanup logic.
 * 
 * @example
 * ```ts
 * class CryptoNewsMediaDownloader extends BaseTelegramMediaDownloader {
 *   protected buildStoragePath(
 *     channelId: string,
 *     messageId: number,
 *     index: number,
 *     extension: string,
 *   ): string {
 *     return this.pathBuilder.buildMediaPath(channelId, messageId, index, extension);
 *   }
 * }
 * ```
 */
export abstract class BaseTelegramMediaDownloader {
  constructor(
    protected readonly fileSystem: BaseFileSystemAdapter,
    protected readonly pathBuilder: BaseMediaPathBuilder,
  ) {}

  /**
   * Download media from Telegram and save to disk.
   * 
   * Handles:
   * - Buffer or file path results from GramJS
   * - MIME type detection
   * - Extension mapping
   * - Path building
   * - File I/O
   * - Cleanup of temp files
   * 
   * Subclasses must implement buildStoragePath() to define where to save.
   * 
   * @param client - Telegram client (GramJS)
   * @param channelId - Channel/chat ID
   * @param messageId - Message ID
   * @param index - Media index in grouped media
   * @param media - Telegram Api.MessageMedia object
   * @returns Download metadata (path, MIME, size)
   */
  public async download(
    client: any, // TelegramClient from GramJS
    channelId: string,
    messageId: number,
    index: number,
    media: any, // Api.MessageMedia
  ): Promise<DownloadedMedia> {
    // Step 1: Download from Telegram
    const result = await this.downloadFromTelegram(client, media);

    // Step 2: Convert result to Buffer
    const buffer = await this.resultToBuffer(result);

    // Step 3: Detect MIME type
    const mimeType = MimeTypeResolver.getMimeTypeFromTelegramMedia(media);

    // Step 4: Determine file extension
    const extension = this.getExtensionForMedia(media, mimeType);

    // Step 5: Build storage path (subclass-specific)
    const filePath = this.buildStoragePath(
      channelId,
      messageId,
      index,
      extension,
    );

    // Step 6: Write to disk
    await this.fileSystem.write(filePath, buffer);

    // Step 7: Get file size
    const stat = await this.fileSystem.stat(filePath);

    return {
      filePath,
      mimeType,
      fileSize: stat.size,
    };
  }

  /**
   * Download media from Telegram using the client.
   * 
   * Returns either a Buffer or a temp file path (GramJS behavior).
   * Subclasses can override to add retry logic (e.g., FloodWaitHandler).
   * 
   * @param client - Telegram client
   * @param media - Media object to download
   * @returns Buffer or temp file path
   */
  protected async downloadFromTelegram(
    client: any,
    media: any,
  ): Promise<Buffer | string> {
    return await client.downloadMedia(media, {});
  }

  /**
   * Convert download result to Buffer.
   * 
   * GramJS may return a Buffer directly or write to a temp file.
   * If a file path is returned, read it and clean up.
   * 
   * @param result - Result from downloadMedia()
   * @returns Buffer containing the media data
   */
  protected async resultToBuffer(result: Buffer | string): Promise<Buffer> {
    if (Buffer.isBuffer(result)) {
      return result;
    }

    if (typeof result === 'string') {
      // Result is a temp file path
      const buffer = await readFile(result);
      
      // Clean up temp file
      try {
        await unlink(result);
      } catch (error) {
        console.warn(`Failed to delete temp file ${result}:`, error);
      }

      return buffer;
    }

    throw new Error(
      `Unexpected download result type: ${typeof result}. Expected Buffer or string.`,
    );
  }

  /**
   * Get file extension for a media object.
   * 
   * For photos, always returns '.jpg' (Telegram default).
   * For documents, derives from MIME type.
   * 
   * @param media - Telegram media object
   * @param mimeType - Detected MIME type (may be null)
   * @returns File extension with leading dot
   */
  protected getExtensionForMedia(media: any, mimeType: string | null): string {
    // Photos are always JPEG
    if (media.className === 'MessageMediaPhoto') {
      return '.jpg';
    }

    // Documents: derive from MIME type
    if (mimeType) {
      return MimeTypeResolver.getExtensionFromMimeType(mimeType);
    }

    // Fallback for unknown types
    return '.bin';
  }

  /**
   * Build the storage path for a downloaded media file.
   * 
   * Subclasses implement this to define their path convention.
   * 
   * @param channelId - Channel/chat ID
   * @param messageId - Message ID
   * @param index - Media index
   * @param extension - File extension (with dot)
   * @returns Absolute path where the file should be saved
   */
  protected abstract buildStoragePath(
    channelId: string,
    messageId: number,
    index: number,
    extension: string,
  ): string;
}
