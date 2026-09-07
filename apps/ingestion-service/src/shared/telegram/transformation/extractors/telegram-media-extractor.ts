/**
 * Telegram Media Extractor
 * 
 * Extracts media metadata from Telegram messages (photos, videos, documents).
 * This extractor does NOT download media files — it only extracts metadata
 * (file IDs, access hashes, MIME types, etc.).
 * 
 * Physical download is the responsibility of MediaDownloaderService.
 * 
 * Slot priority:
 * 1. video field (native video messages)
 * 2. document field with video/ MIME type (video files sent as documents)
 * 3. photo field (photo messages)
 * 4. webpage preview photo (link previews)
 */

import { AbstractMediaExtractor, type MediaSlot } from '../core/abstract-media-extractor';
import type { TelegramMediaAttachment } from 'telegram/shared/ports/telegram-listener.port';

export class TelegramMediaExtractor extends AbstractMediaExtractor {
  protected readonly slots: MediaSlot[] = [
    // Priority 1: Native video messages
    { field: 'video', type: 'video' },
    
    // Priority 2: Video files sent as documents
    {
      field: 'document',
      type: 'video',
      validate: (raw) =>
        ((raw.mimeType as string) ?? '').toLowerCase().startsWith('video/'),
    },
    
    // Priority 3: Photo messages
    { field: 'photo', type: 'photo' },
  ];

  /**
   * Extract media metadata from Telegram media object
   * 
   * Tries each slot in priority order, falls back to webpage preview if no slots match.
   * 
   * @param media - Raw Telegram media object
   * @returns Media attachment metadata or null if no valid media found
   */
  extract(media: unknown): TelegramMediaAttachment | null {
    // Try each slot in priority order
    for (const slot of this.slots) {
      const result = this.trySlot(media, slot);
      if (result) return result;
    }

    // Fall back to webpage preview photo
    return this.extractWebpagePreview(media);
  }
}
