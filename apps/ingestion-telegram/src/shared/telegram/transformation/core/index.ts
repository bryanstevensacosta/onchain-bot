/**
 * Core abstractions for Telegram message transformation
 * 
 * These base classes define the framework for transforming raw Telegram messages
 * into normalized TelegramRawMessage format. Subclasses implement specific
 * extraction strategies (KOL vs crypto-news).
 */

// Export all core abstractions (will be added in subsequent tasks)
export * from './abstract-text-extractor';
export * from './abstract-media-extractor';
export * from './abstract-entity-normalizer';
export * from './abstract-message-transformer';
export * from './abstract-entity-normalizer';
export * from './abstract-message-transformer';
