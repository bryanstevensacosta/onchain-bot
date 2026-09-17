/**
 * KOL Message Transformer
 * 
 * Transforms raw Telegram messages from KOL channels into normalized format.
 * 
 * Key behaviors:
 * - Text is ALWAYS EMPTY (ToS invariant — backend extracts text directly)
 * - Media metadata extracted (no physical download for KOL messages)
 * - Entities normalized from GramJS className format
 * 
 * Per fix-1: KolIngestionOrchestratorUseCase in backend calls ExtractFromMessageUseCase
 * directly with raw text, preventing raw content from crossing the event bus.
 */

import { AbstractMessageTransformer } from '../core/abstract-message-transformer';
import { KolTextExtractor } from '../extractors/kol-text-extractor';
import { TelegramMediaExtractor } from '../extractors/telegram-media-extractor';
import { TelegramEntityNormalizer } from '../extractors/telegram-entity-normalizer';

export class KolMessageTransformer extends AbstractMessageTransformer {
  constructor() {
    super(
      new KolTextExtractor(),        // Returns empty (ToS)
      new TelegramMediaExtractor(),  // Metadata only
      new TelegramEntityNormalizer(), // className → type
    );
  }
}
