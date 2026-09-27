/**
 * Crypto News Message Transformer
 *
 * Transforms raw Telegram messages from feed channels into normalized format.
 *
 * Key behaviors:
 * - Text extracted via 4-source cascade (message → text → caption → fwdFrom)
 * - Media metadata extracted (physical download handled separately by adapter)
 * - Entities normalized from GramJS className format
 *
 * Unlike KOL messages, feed text CAN cross the event bus (no ToS restrictions).
 */

import { AbstractMessageTransformer } from '../core/abstract-message-transformer';
import { FeedTextExtractor } from '../extractors/feed-text-extractor';
import { TelegramMediaExtractor } from '../extractors/telegram-media-extractor';
import { TelegramEntityNormalizer } from '../extractors/telegram-entity-normalizer';

export class FeedMessageTransformer extends AbstractMessageTransformer {
  constructor() {
    super(
      new FeedTextExtractor(), // 4-source cascade
      new TelegramMediaExtractor(), // Metadata only
      new TelegramEntityNormalizer(), // className → type
    );
  }
}
