/**
 * KOL Text Extractor (Q1-B amended)
 *
 * Per ADR `docs/architecture/adr-kol-raw-text.md` (telegram-feed-unification
 * item 7, decision Q1-B): KOL raw text IS extracted via the same 4-source
 * cascade as crypto-news (`message` → `text` → `media.caption` →
 * `fwdFrom.message`). The coordinator persists it RAW into
 * `telegram_feed_messages` (type='kol', no media) and carries it in the SSE
 * `payload.text`.
 *
 * Amendment scope: ingestion-side storage + SSE ONLY. The backend-internal
 * ToS boundary is UNCHANGED — `KolMessageIngestedEvent`
 * (`telegram.message.ingested`) still carries NO text; raw text reaches the
 * backend pipeline via direct SSE-adapter → orchestrator handoff, never via
 * the backend event bus (fix-1 holds).
 */

import { AbstractTextExtractor } from '../core/abstract-text-extractor';

export class KolTextExtractor extends AbstractTextExtractor {
  /**
   * Extract text from KOL message with 4-source cascade (Q1-B).
   *
   * Same cascade as `CryptoNewsTextExtractor`:
   * 1. msg.message (primary)
   * 2. msg.text (secondary)
   * 3. msg.media.caption (tertiary)
   * 4. msg.fwdFrom.message (fallback)
   *
   * @param msg - Message object
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
