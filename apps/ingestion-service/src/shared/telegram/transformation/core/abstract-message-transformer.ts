/**
 * Abstract base class for message transformation (Template Method pattern)
 * 
 * Orchestrates the extraction of text, media, and entities from raw Telegram messages.
 * Subclasses provide concrete extractors and entity normalizers via dependency injection.
 * 
 * Template method: transform() → extractText() → extractMedia() → normalizeEntities()
 * 
 * @abstract
 */

import type { AbstractTextExtractor } from './abstract-text-extractor';
import type { AbstractMediaExtractor } from './abstract-media-extractor';
import type { AbstractEntityNormalizer, NormalizedEntity } from './abstract-entity-normalizer';

/**
 * Raw message input (from GramJS)
 */
export interface RawTelegramMessage {
  id?: number;
  peerId?: unknown;
  message?: string;
  text?: string;
  media?: unknown;
  entities?: unknown[];
  fwdFrom?: { message?: string };
  groupedId?: unknown;
  date?: number;
}

/**
 * Transformed message output
 */
export interface TransformedMessage {
  id: number;
  peerId: string;
  text: string;
  media: Array<{
    type: 'photo' | 'video';
    fileId: bigint | string;
    accessHash: bigint | string;
    fileReference: string;
    mimeType: string | null;
    dcId?: number;
    date?: number;
    webpageUrl?: string | null;
    webpageTitle?: string | null;
    webpageDescription?: string | null;
    webpageSiteName?: string | null;
  }>;
  entities: NormalizedEntity[];
  groupedId: bigint | string | null;
  occurredAt: Date;
}

export abstract class AbstractMessageTransformer {
  constructor(
    protected readonly textExtractor: AbstractTextExtractor,
    protected readonly mediaExtractor: AbstractMediaExtractor,
    protected readonly entityNormalizer: AbstractEntityNormalizer,
  ) {}

  /**
   * Template method: orchestrates message transformation
   * 
   * Subclasses can override to add pre/post processing,
   * but the default implementation covers most cases.
   * 
   * @param raw - Raw Telegram message
   * @returns Transformed message or null if invalid
   */
  transform(raw: RawTelegramMessage): TransformedMessage | null {
    // Validate required fields
    if (!this.isValidMessage(raw)) return null;

    const id = raw.id!;
    const peerId = this.normalizePeerId(raw.peerId);
    const occurredAt = this.extractDate(raw);

    // Extract text (step 1)
    const text = this.extractText(raw);

    // Extract media (step 2)
    const media = this.extractMedia(raw);

    // Normalize entities (step 3)
    const entities = this.normalizeEntities(raw);

    // Extract groupedId (for media albums)
    const groupedId = this.extractGroupedId(raw);

    return {
      id,
      peerId,
      text,
      media,
      entities,
      groupedId,
      occurredAt,
    };
  }

  /**
   * Step 1: Extract text using configured text extractor
   */
  protected extractText(raw: RawTelegramMessage): string {
    return this.textExtractor.extract(raw);
  }

  /**
   * Step 2: Extract media using configured media extractor
   */
  protected extractMedia(raw: RawTelegramMessage): TransformedMessage['media'] {
    const result = this.mediaExtractor.extract(raw.media);
    return result ? [result] : [];
  }

  /**
   * Step 3: Normalize entities using configured entity normalizer
   */
  protected normalizeEntities(raw: RawTelegramMessage): NormalizedEntity[] {
    if (!Array.isArray(raw.entities)) return [];
    return this.entityNormalizer.normalize(raw.entities);
  }

  /**
   * Validate message has required fields
   */
  protected isValidMessage(raw: RawTelegramMessage): boolean {
    return typeof raw.id === 'number' && raw.peerId !== undefined;
  }

  /**
   * Normalize peerId to string
   * 
   * Handles bigint, number, string, and objects with toString()
   */
  protected normalizePeerId(peerId: unknown): string {
    if (peerId === null || peerId === undefined) return '';
    if (typeof peerId === 'bigint') return peerId.toString();
    if (typeof peerId === 'string') return peerId;
    if (typeof peerId === 'number') return String(peerId);
    return (peerId as { toString(): string }).toString();
  }

  /**
   * Extract date from message
   * 
   * Falls back to current date if missing (should not happen in real messages)
   */
  protected extractDate(raw: RawTelegramMessage): Date {
    if (typeof raw.date === 'number') {
      return new Date(raw.date * 1000); // Telegram dates are Unix timestamps
    }
    return new Date();
  }

  /**
   * Extract groupedId (for media albums)
   * 
   * Returns null if not present
   */
  protected extractGroupedId(raw: RawTelegramMessage): bigint | string | null {
    const { groupedId } = raw;
    if (groupedId === null || groupedId === undefined) return null;
    if (typeof groupedId === 'bigint') return groupedId;
    if (typeof groupedId === 'string') return groupedId;
    if (typeof groupedId === 'number') return String(groupedId);
    return (groupedId as { toString(): string }).toString();
  }
}
