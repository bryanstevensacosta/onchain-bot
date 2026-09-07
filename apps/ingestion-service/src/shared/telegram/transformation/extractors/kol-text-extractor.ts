/**
 * KOL Text Extractor (ToS-compliant)
 * 
 * Per Invariant ToS (fix-1): Raw Telegram text from KOL messages MUST NOT cross the event bus.
 * The backend pipeline extracts text directly using its own extraction logic.
 * 
 * This extractor enforces the ToS invariant by always returning empty string.
 * 
 * @see apps/backend/docs/spydefi/arch/09-anti-patterns.md (fix-1)
 */

import { AbstractTextExtractor } from '../core/abstract-text-extractor';

export class KolTextExtractor extends AbstractTextExtractor {
  /**
   * Extract text from KOL message (always returns empty per ToS invariant)
   * 
   * Per fix-1: KolIngestionOrchestratorUseCase calls ExtractFromMessageUseCase
   * directly with raw text. This prevents raw Telegram content from crossing
   * the event bus boundary, maintaining ToS compliance.
   * 
   * @param _msg - Message object (ignored)
   * @returns Empty string (ToS-compliant)
   */
  extract(_msg: unknown): string {
    return '';
  }
}
