/**
 * Abstract base class for entity normalization
 * 
 * Normalizes Telegram entity objects (links, mentions, hashtags, etc.)
 * from GramJS className format to a common normalized format.
 * 
 * Entities represent structured data within message text:
 * - URLs and text URLs
 * - Mentions and hashtags
 * - Text formatting (bold, italic, code, etc.)
 * 
 * @abstract
 */

/**
 * Normalized entity format (common across both apps)
 */
export interface NormalizedEntity {
  offset: number;
  length: number;
  type: string;
  url?: string;
}

export abstract class AbstractEntityNormalizer {
  /**
   * Normalize Telegram entities to common format
   * 
   * @param entities - Raw entities from Telegram message
   * @returns Array of normalized entities
   */
  abstract normalize(entities: unknown[]): NormalizedEntity[];

  /**
   * Map Telegram className to normalized type
   * 
   * GramJS uses className like "MessageEntityUrl", we normalize to "url".
   * 
   * @param className - Telegram entity className
   * @returns Normalized type string
   */
  protected normalizeType(className?: string): string {
    const map: Record<string, string> = {
      MessageEntityUrl: 'url',
      MessageEntityTextUrl: 'text_url',
      MessageEntityBold: 'bold',
      MessageEntityItalic: 'italic',
      MessageEntityCode: 'code',
      MessageEntityPre: 'pre',
      MessageEntityStrike: 'strike',
      MessageEntityUnderline: 'underline',
      MessageEntitySpoiler: 'spoiler',
      MessageEntityMention: 'mention',
      MessageEntityHashtag: 'hashtag',
      MessageEntityCashtag: 'cashtag',
      MessageEntityBotCommand: 'bot_command',
      MessageEntityEmail: 'email',
      MessageEntityPhone: 'phone',
      MessageEntityBlockquote: 'blockquote',
    };
    
    return map[className ?? ''] ?? 'unknown';
  }
}
