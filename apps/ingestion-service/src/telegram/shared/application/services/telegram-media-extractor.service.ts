import { Injectable, Logger } from '@nestjs/common';
import { Api } from 'telegram';
import type { TelegramClient } from 'telegram';
import type { TelegramMediaAttachment } from '../../ports/telegram-listener.port';
import { MediaDownloaderService } from 'media/application/services/media-downloader.service';

/**
 * TelegramMediaExtractorService
 * 
 * Encapsulates Telegram media extraction + download logic.
 * 
 * Phase 5.2 Refactor: Extracted from TelegramMtprotoListenerAdapter to:
 * - Separate media handling concerns from message transformation
 * - Make media download logic testable and reusable
 * - Follow Single Responsibility Principle
 * 
 * Responsibilities:
 * - Extract media metadata from Telegram message objects
 * - Download media files to disk (photos, videos)
 * - Return TelegramMediaAttachment[] with filePath + metadata
 * 
 * Used by: TelegramMtprotoListenerAdapter
 */
@Injectable()
export class TelegramMediaExtractorService {
  private readonly logger = new Logger(TelegramMediaExtractorService.name);

  constructor(private readonly mediaDownloader: MediaDownloaderService) {}

  /**
   * Extract and download media attachments from Telegram message
   * 
   * Handles:
   * - MessageMediaPhoto → photo download
   * - MessageMediaDocument with video/ MIME → video download
   * 
   * @param client - TelegramClient instance for downloading
   * @param peerId - Channel/chat peer ID
   * @param messageId - Message ID
   * @param media - Raw Telegram media object
   * @returns Array of media attachments with filePath, or undefined if no media
   */
  async extractAndDownload(
    client: TelegramClient,
    peerId: string,
    messageId: number,
    media: unknown,
  ): Promise<TelegramMediaAttachment[] | undefined> {
    const result: TelegramMediaAttachment[] = [];

    try {
      // Handle single photo
      if (media instanceof Api.MessageMediaPhoto && media.photo) {
        const attachment = await this.downloadPhoto(
          client,
          peerId,
          messageId,
          media,
        );
        if (attachment) {
          result.push(attachment);
        }
      }

      // Handle document (video, file, etc.)
      if (media instanceof Api.MessageMediaDocument && media.document) {
        const attachment = await this.downloadVideoDocument(
          client,
          peerId,
          messageId,
          media,
        );
        if (attachment) {
          result.push(attachment);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to extract/download media for ${peerId}:${messageId}: ${(error as Error).message}`,
      );
      // Throw error so caller can decide how to handle
      throw error;
    }

    return result.length > 0 ? result : undefined;
  }

  /**
   * Download photo and return attachment with metadata + filePath
   */
  private async downloadPhoto(
    client: TelegramClient,
    peerId: string,
    messageId: number,
    media: Api.MessageMediaPhoto,
  ): Promise<TelegramMediaAttachment | null> {
    if (!media.photo) return null;

    const photo = media.photo as Api.Photo;
    const downloaded = await this.mediaDownloader.download(
      client,
      peerId,
      messageId,
      0,
      media,
    );

    return {
      type: 'photo',
      index: 0,
      fileId: photo.id.toString(),
      accessHash: photo.accessHash.toString(),
      fileReference: Buffer.from(photo.fileReference).toString('base64'),
      mimeType: downloaded.mimeType,
      dcId: photo.dcId,
      date: photo.date,
      filePath: downloaded.filePath,
      fileSize: downloaded.fileSize,
    };
  }

  /**
   * Download video document and return attachment with metadata + filePath
   * Only downloads documents with video/ MIME type
   */
  private async downloadVideoDocument(
    client: TelegramClient,
    peerId: string,
    messageId: number,
    media: Api.MessageMediaDocument,
  ): Promise<TelegramMediaAttachment | null> {
    if (!media.document) return null;

    const doc = media.document as Api.Document;
    const isVideo = doc.mimeType?.startsWith('video/') ?? false;

    if (!isVideo) {
      // Skip non-video documents
      return null;
    }

    const downloaded = await this.mediaDownloader.download(
      client,
      peerId,
      messageId,
      0,
      media,
    );

    return {
      type: 'video',
      index: 0,
      fileId: doc.id.toString(),
      accessHash: doc.accessHash.toString(),
      fileReference: Buffer.from(doc.fileReference).toString('base64'),
      mimeType: downloaded.mimeType,
      dcId: doc.dcId,
      date: doc.date,
      filePath: downloaded.filePath,
      fileSize: downloaded.fileSize,
    };
  }
}
