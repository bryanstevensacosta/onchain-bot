/**
 * KOL Message Transformer
 *
 * Transforms raw Telegram messages from KOL channels into normalized format.
 *
 * Key behaviors (Q1-B amended — see docs/architecture/adr-kol-raw-text.md):
 * - Text extracted via 4-source cascade (persisted RAW + carried in SSE)
 * - Media metadata extracted (no physical download for KOL messages)
 * - Entities normalized from GramJS className format
 *
 * Backend-internal ToS boundary UNCHANGED: `KolMessageIngestedEvent`
 * (`telegram.message.ingested`) still carries NO text (fix-1 holds).
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
      new KolTextExtractor(), // 4-source cascade (Q1-B)
      new TelegramMediaExtractor(), // Metadata only
      new TelegramEntityNormalizer(), // className → type
    );
  }
}
