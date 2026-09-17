/**
 * Crypto News Text Extractor
 * 
 * Extracts text from crypto-news messages using 4-source cascade:
 * 1. msg.message (primary)
 * 2. msg.text (secondary)
 * 3. msg.media.caption (tertiary)
 * 4. msg.fwdFrom.message (fallback)
 * 
 * Unlike KOL messages, crypto-news text is opaque content that can cross
 * the event bus boundary (no ToS restrictions).
 */

import { AbstractTextExtractor } from '../core/abstract-text-extractor';

export class CryptoNewsTextExtractor extends AbstractTextExtractor {
  /**
   * Extract text with 4-source cascade
   * 
   * @param msg - Telegram message object
   * @returns Extracted text or empty string
   */
  extract(msg: any): string {
    // Handle null/undefined
    if (!msg) return '';

    // Try message or text fields first (both primary sources)
    const primaryText = this.cascadeExtract(msg, ['message', 'text']);
    if (primaryText) return primaryText;

    // Try media caption
    if (msg.media) {
      const captionText = this.extractFromField(msg.media, 'caption');
      if (captionText) return captionText;
    }

    // Try forwarded message as last resort
    if (msg.fwdFrom) {
      const forwardedText = this.extractFromField(msg.fwdFrom, 'message');
      if (forwardedText) return forwardedText;
    }

    // All sources exhausted
    return '';
  }
}
