/**
 * Abstract base class for media metadata extraction
 * 
 * Extracts metadata from Telegram media objects (photos, videos, documents).
 * Does NOT handle physical download - that's the responsibility of MediaDownloaderService.
 * 
 * This class focuses on extracting:
 * - File IDs and access hashes
 * - File references (for Telegram API)
 * - MIME types
 * - DC IDs and dates
 * - Webpage preview metadata
 * 
 * @abstract
 */

import type { TelegramMediaAttachment } from 'telegram/shared/ports/telegram-listener.port';

/**
 * Media slot definition for extraction priority
 */
export interface MediaSlot {
  field: 'photo' | 'video' | 'document';
  type: 'photo' | 'video';
  validate?: (raw: RawMediaObject) => boolean;
}

/**
 * Raw media object from Telegram (GramJS)
 */
export interface RawMediaObject {
  id?: unknown;
  accessHash?: unknown;
  fileReference?: unknown;
  mimeType?: unknown;
  dcId?: unknown;
  date?: unknown;
}

export abstract class AbstractMediaExtractor {
  /**
   * Extraction priority slots (subclasses can override)
   */
  protected abstract readonly slots: MediaSlot[];

  /**
   * Extract media metadata from Telegram media object.
   * 
   * Returns null if no valid media found.
   * 
   * @param media - Raw Telegram media object
   * @returns Media attachment metadata or null
   */
  abstract extract(media: unknown): TelegramMediaAttachment | null;

  /**
   * Try to extract from a specific slot (photo, video, document)
   * 
   * @param media - Media container object
   * @param slot - Slot configuration
   * @returns Attachment metadata or null
   */
  protected trySlot(
    media: unknown,
    slot: MediaSlot,
  ): TelegramMediaAttachment | null {
    if (!media || typeof media !== 'object') return null;

    const obj = (media as Record<string, unknown>)[slot.field];
    if (!obj || typeof obj !== 'object') return null;

    const raw = obj as RawMediaObject;

    // Apply optional validation
    if (slot.validate && !slot.validate(raw)) return null;

    return this.buildAttachment(raw, slot.type);
  }

  /**
   * Build TelegramMediaAttachment from raw media object
   * 
   * @param raw - Raw media object
   * @param type - Media type (photo or video)
   * @returns Attachment metadata or null if invalid
   */
  protected buildAttachment(
    raw: RawMediaObject,
    type: 'photo' | 'video',
  ): TelegramMediaAttachment | null {
    if (!this.isValidMediaId(raw.id)) return null;

    const fileRef = this.fileReferenceToBuffer(raw.fileReference);
    if (!fileRef) return null;

    return {
      type,
      fileId: this.coerceToString(raw.id),
      accessHash: this.coerceToString(raw.accessHash),
      fileReference: fileRef.toString('base64'),
      mimeType: (raw.mimeType as string) ?? null,
      dcId: (raw.dcId as number) ?? undefined,
      date: (raw.date as number) ?? undefined,
    };
  }

  /**
   * Extract webpage preview media
   * 
   * Telegram messages can contain webpage previews with embedded photos.
   * This method extracts the preview photo if present.
   * 
   * @param media - Media object
   * @returns Attachment with webpage metadata or null
   */
  protected extractWebpagePreview(
    media: unknown,
  ): TelegramMediaAttachment | null {
    if (!media || typeof media !== 'object') return null;

    const webpage = (media as { webpage?: Record<string, unknown> }).webpage;
    if (!webpage || typeof webpage !== 'object') return null;

    const wpPhoto = webpage.photo;
    if (!wpPhoto || typeof wpPhoto !== 'object') return null;

    const photoResult = this.buildAttachment(wpPhoto, 'photo');
    if (!photoResult) return null;

    // Add webpage metadata
    return {
      ...photoResult,
      webpageUrl: (webpage.url as string) ?? null,
      webpageTitle: (webpage.title as string) ?? null,
      webpageDescription: (webpage.description as string) ?? null,
      webpageSiteName: (webpage.siteName as string) ?? null,
    };
  }

  /**
   * Validate media ID (must be bigint, string, number, or object)
   */
  protected isValidMediaId(v: unknown): boolean {
    return (
      typeof v === 'bigint' ||
      typeof v === 'string' ||
      typeof v === 'number' ||
      (typeof v === 'object' && v !== null)
    );
  }

  /**
   * Convert file reference to Buffer
   * 
   * File references can come as Buffer, string (binary), or array.
   */
  protected fileReferenceToBuffer(v: unknown): Buffer | null {
    if (Buffer.isBuffer(v)) return v;
    if (typeof v === 'string') return Buffer.from(v, 'binary');
    if (Array.isArray(v)) return Buffer.from(v);
    return null;
  }

  /**
   * Coerce value to string (for IDs and hashes)
   * 
   * Handles bigint, string, number, boolean, symbol.
   */
  protected coerceToString(v: unknown): bigint | string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'bigint') return v;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'symbol') return v.toString();
    return (v as { toString(): string }).toString();
  }
}
