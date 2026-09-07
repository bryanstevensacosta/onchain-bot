/**
 * Crypto News Message Transformer
 * 
 * Transforms raw Telegram messages from crypto-news channels into normalized format.
 * 
 * Key behaviors:
 * - Text extracted via 4-source cascade (message → text → caption → fwdFrom)
 * - Media metadata extracted (physical download handled separately by adapter)
 * - Entities normalized from GramJS className format
 * 
 * Unlike KOL messages, crypto-news text CAN cross the event bus (no ToS restrictions).
 */

import { AbstractMessageTransformer } from '../core/abstract-message-transformer';
import { CryptoNewsTextExtractor } from '../extractors/crypto-news-text-extractor';
import { TelegramMediaExtractor } from '../extractors/telegram-media-extractor';
import { TelegramEntityNormalizer } from '../extractors/telegram-entity-normalizer';

export class CryptoNewsMessageTransformer extends AbstractMessageTransformer {
  constructor() {
    super(
      new CryptoNewsTextExtractor(),  // 4-source cascade
      new TelegramMediaExtractor(),   // Metadata only
      new TelegramEntityNormalizer(), // className → type
    );
  }
}
