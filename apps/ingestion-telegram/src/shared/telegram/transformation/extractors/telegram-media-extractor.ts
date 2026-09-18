/**
 * Telegram Media Extractor
 * 
 * Extracts media metadata from Telegram messages (photos, videos, documents).
 * This extractor does NOT download media files — it only extracts metadata
 * (file IDs, access hashes, MIME types, etc.).
 * 
 * Physical download is the responsibility of MediaDownloaderService.
 * 
 * Slot priority (ONLY actual message attachments):
 * 1. video field (native video messages)
 * 2. document field with video/ MIME type (video files sent as documents)
 * 3. photo field (photo messages)
 * 
 * **DOES NOT extract webpage preview photos** - those are external URL preview
 * images that Telegram generates automatically, not actual user attachments.
 * Extracting them would:
 * - Waste storage downloading external preview images
 * - Show "broken image" icons in frontend for non-downloadable content  
 * - Misrepresent URL previews as actual media attachments
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
   * Tries each slot in priority order.
   * 
   * **IMPORTANT**: Does NOT extract webpage preview photos - these are external URL
   * preview images, not actual message attachments. Downloading them would:
   * 1. Waste storage on external preview images
   * 2. Show "broken image" icons in frontend for non-downloadable content
   * 3. Misrepresent URL previews as actual media attachments
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

    // Do NOT fall back to webpage preview - those are external preview images,
    // not actual message attachments
    return null;
  }
}
