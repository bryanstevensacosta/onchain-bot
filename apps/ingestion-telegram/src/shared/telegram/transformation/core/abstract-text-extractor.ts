/**
 * Abstract base class for text extraction strategies
 * 
 * Defines the contract for extracting text from raw Telegram messages.
 * Subclasses implement different strategies:
 * - KolTextExtractor: Returns empty string (ToS compliance)
 * - CryptoNewsTextExtractor: 4-source cascade (message → text → caption → fwdFrom)
 * 
 * @abstract
 */
export abstract class AbstractTextExtractor {
  /**
   * Extract text from a raw Telegram message.
   * 
   * Subclasses define extraction strategy (e.g., KOL returns empty, crypto-news cascades sources)
   * 
   * @param msg - Raw Telegram message object
   * @returns Extracted text (may be empty string)
   */
  abstract extract(msg: any): string;

  /**
   * Helper: safely extract text from a specific field
   * 
   * @param obj - Object containing the field
   * @param field - Field name to extract from
   * @returns Extracted text or null if field missing/empty
   */
  protected extractFromField(obj: any, field: string): string | null {
    if (!obj || typeof obj !== 'object') return null;
    
    const value = obj[field];
    
    if (!value || typeof value !== 'string') return null;
    
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Helper: extract text from multiple fields (cascade)
   * 
   * Returns the first non-null value found, or empty string if all null.
   * 
   * @param msg - Message object
   * @param fields - Array of field names to try in order
   * @returns First non-null text, or empty string
   * 
   * @example
   * ```typescript
   * // Try message field first, then text field
   * const text = this.cascadeExtract(msg, ['message', 'text']);
   * ```
   */
  protected cascadeExtract(msg: any, fields: string[]): string {
    for (const field of fields) {
      const text = this.extractFromField(msg, field);
      if (text) return text;
    }
    return '';
  }
}
