import bigInt from 'big-integer';
import type { TelegramMediaAttachment } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';

interface GramjsMessageEntity {
  offset: number;
  length: number;
  className?: string;
  url?: string;
}

interface RawTelegramMessage {
  id: number;
  message?: string;
  date: number;
  media?: unknown;
  entities?: GramjsMessageEntity[];
  groupedId?: string;
}

type MediaSlot = {
  field: 'photo' | 'video' | 'document';
  type: 'photo' | 'video';
  validate?: (raw: RawMediaObject) => boolean;
};

interface RawMediaObject {
  id?: unknown;
  accessHash?: unknown;
  fileReference?: unknown;
  mimeType?: unknown;
  dcId?: unknown;
  date?: unknown;
}

class MediaExtractor {
  private readonly slots: MediaSlot[] = [
    { field: 'video', type: 'video' },
    {
      field: 'document',
      type: 'video',
      validate: (raw) =>
        ((raw.mimeType as string) ?? '').toLowerCase().startsWith('video/'),
    },
    { field: 'photo', type: 'photo' },
  ];

  extract(media: unknown): TelegramMediaAttachment | null {
    for (const slot of this.slots) {
      const result = this.trySlot(media, slot);
      if (result) return result;
    }
    return this.extractWebpagePreview(media);
  }

  private trySlot(
    media: unknown,
    slot: MediaSlot,
  ): TelegramMediaAttachment | null {
    if (!media || typeof media !== 'object') return null;
    const obj = (media as Record<string, unknown>)[slot.field];
    if (!obj || typeof obj !== 'object') return null;
    const raw = obj as RawMediaObject;
    if (slot.validate && !slot.validate(raw)) return null;
    return this.buildAttachment(raw, slot.type);
  }

  private buildAttachment(
    raw: RawMediaObject,
    type: 'photo' | 'video',
  ): TelegramMediaAttachment | null {
    if (!this.isValidId(raw.id)) return null;
    const fileRef = fileReferenceToBuffer(raw.fileReference);
    if (!fileRef) return null;
    return {
      type,
      fileId: coerceToString(raw.id),
      accessHash: coerceToString(raw.accessHash),
      fileReference: fileRef.toString('base64'),
      mimeType: (raw.mimeType as string) ?? null,
      dcId: (raw.dcId as number) ?? undefined,
      date: (raw.date as number) ?? undefined,
    };
  }

  private extractWebpagePreview(
    media: unknown,
  ): TelegramMediaAttachment | null {
    if (!media || typeof media !== 'object') return null;
    const webpage = (media as { webpage?: Record<string, unknown> }).webpage;
    if (!webpage || typeof webpage !== 'object') return null;
    const wpPhoto = webpage.photo;
    if (!wpPhoto || typeof wpPhoto !== 'object') return null;
    const photoResult = this.buildAttachment(wpPhoto, 'photo');
    if (!photoResult) return null;
    return {
      ...photoResult,
      webpageUrl: (webpage.url as string) ?? null,
      webpageTitle: (webpage.title as string) ?? null,
      webpageDescription: (webpage.description as string) ?? null,
      webpageSiteName: (webpage.siteName as string) ?? null,
    };
  }

  private isValidId(v: unknown): boolean {
    return (
      typeof v === 'bigint' ||
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'object'
    );
  }
}

function safeToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'symbol') return v.toString();
  return (v as { toString(): string }).toString();
}

function fileReferenceToBuffer(v: unknown): Buffer | null {
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'string') return Buffer.from(v, 'binary');
  if (Array.isArray(v)) return Buffer.from(v);
  return null;
}

function coerceToString(v: unknown): bigint | string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'bigint') return v;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'symbol') return v.toString();
  return (v as { toString(): string }).toString();
}

function coerceToLong(value: bigint | string): bigInt.BigInteger {
  if (typeof value === 'bigint') return bigInt(value.toString());
  return bigInt(String(value));
}

function isRefreshableDownloadError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? '';
  return (
    msg.includes('FILE_REFERENCE_EXPIRED') ||
    msg.includes('FILEREF_UPGRADE_NEEDED') ||
    msg.includes('FILE_REFERENCE_INVALID') ||
    msg.includes('sizes') ||
    msg.includes('no photo') ||
    msg.includes('No file')
  );
}

export type { GramjsMessageEntity, RawTelegramMessage, RawMediaObject };
export {
  MediaExtractor,
  safeToString,
  fileReferenceToBuffer,
  coerceToString,
  coerceToLong,
  isRefreshableDownloadError,
};
