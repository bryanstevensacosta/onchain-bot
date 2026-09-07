/**
 * Message transformers (orchestrators)
 * 
 * These classes compose extractors to transform complete messages.
 * Each transformer implements a specific pipeline:
 * - KolMessageTransformer: ToS-compliant (empty text) + metadata-only media
 * - CryptoNewsMessageTransformer: 4-source text cascade + media metadata
 */

export * from './kol-message-transformer';
export * from './crypto-news-message-transformer';
