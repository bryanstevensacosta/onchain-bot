/**
 * Telegram Entity Normalizer
 * 
 * Normalizes GramJS entity objects from className format to normalized type strings.
 * 
 * Entities represent structured data within message text:
 * - URLs and text URLs (clickable links)
 * - Mentions and hashtags (social features)
 * - Text formatting (bold, italic, code, etc.)
 * 
 * Example:
 * Input:  { offset: 0, length: 10, className: 'MessageEntityUrl', url: 'https://...' }
 * Output: { offset: 0, length: 10, type: 'url', url: 'https://...' }
 */

import { AbstractEntityNormalizer, type NormalizedEntity } from '../core/abstract-entity-normalizer';

interface GramjsMessageEntity {
  offset: number;
  length: number;
  className?: string;
  url?: string;
}

export class TelegramEntityNormalizer extends AbstractEntityNormalizer {
  /**
   * Normalize array of Telegram entities
   * 
   * Converts GramJS className format to normalized type strings.
   * Preserves offset, length, and optional URL field.
   * 
   * @param entities - Raw entities from GramJS message
   * @returns Array of normalized entities
   */
  normalize(entities: unknown[]): NormalizedEntity[] {
    if (!Array.isArray(entities)) return [];

    return entities.map((e: any) => {
      const entity: GramjsMessageEntity = e;
      
      const normalized: NormalizedEntity = {
        offset: entity.offset,
        length: entity.length,
        type: this.normalizeType(entity.className),
      };

      // Include URL field if present (for text_url entities)
      if (entity.url) {
        normalized.url = entity.url;
      }

      return normalized;
    });
  }
}
