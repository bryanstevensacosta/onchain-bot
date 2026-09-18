/**
 * Concrete implementations of extraction strategies
 * 
 * These classes implement specific extraction logic for:
 * - Text extraction (KOL vs crypto-news strategies)
 * - Media metadata extraction (from GramJS objects)
 * - Entity normalization (Telegram className to normalized types)
 */

// Export all extractors (will be added in subsequent tasks)
export * from './kol-text-extractor';
export * from './crypto-news-text-extractor';
export * from './telegram-media-extractor';
export * from './telegram-entity-normalizer';
