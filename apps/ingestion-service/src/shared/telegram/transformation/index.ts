/**
 * Telegram Message Transformation Pipeline
 * 
 * **Architecture**: Template Method + Strategy Pattern
 * 
 * **Purpose**: Transform raw Telegram messages into normalized TelegramRawMessage format
 * with different strategies for KOL (ToS-compliant, no text) vs crypto-news (4-source cascade + media download).
 * 
 * **Location**: Ingestion-service is the source of truth (backend imports via @ingestion-service/telegram/*)
 * 
 * **Key Components**:
 * - core/: Abstract base classes (framework)
 * - extractors/: Concrete strategies (text, media, entities)
 * - transformers/: Orchestrators that compose extractors
 * - ports/: Interfaces for dependency inversion
 * - utils/: Pure utility functions
 * 
 * **Usage**:
 * ```typescript
 * // Backend (imports from ingestion-service)
 * import { 
 *   AbstractMessageTransformer,
 *   KolTextExtractor,
 *   TelegramMediaExtractor 
 * } from '@ingestion-service/telegram/transformation';
 * 
 * // Ingestion (local import)
 * import { CryptoNewsMessageTransformer } from 'shared/telegram/transformation';
 * ```
 * 
 * @module telegram/transformation
 */

// Re-export all modules
export * from './core';
export * from './extractors';
export * from './transformers';
export * from './ports';
export * from './utils';
