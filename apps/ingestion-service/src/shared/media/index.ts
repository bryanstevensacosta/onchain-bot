/**
 * Shared media abstractions for ingestion-service and backend.
 * 
 * **Phase 1: Core Abstractions** (Low Risk)
 * 
 * This module provides base classes and utilities for media operations,
 * eliminating ~400+ lines of duplicated code across the codebase.
 * 
 * **Usage**:
 * - Ingestion-service: Use directly (owner of crypto-news media)
 * - Backend: Import from ingestion-service for ads media components
 * 
 * **Cohesion Benefits**:
 * - Single source of truth for MIME types, path sanitization
 * - Consistent cache headers, error handling
 * - Shared Telegram download logic
 * - Unified retention policies
 * 
 * @see .omo/drafts/media-cohesion-refactor.md for full refactor plan
 */

// Core abstract base classes
export { BaseMediaPathBuilder } from './core/base-media-path-builder';
export { BaseFileSystemAdapter } from './core/base-file-system-adapter';
export { BaseMediaHttpServer } from './core/base-media-http-server';
export { BaseTelegramMediaDownloader } from './core/base-telegram-media-downloader';
export { BaseMediaRetentionPolicy } from './core/base-media-retention-policy';

// Utility classes (stateless)
export { MimeTypeResolver } from './utils/mime-type-resolver';
export { PathSanitizer } from './utils/path-sanitizer';

// Shared types
export type {
  DownloadedMedia,
  MediaPayload,
  PathConfig,
  CacheConfig,
  CleanupResult,
} from './types/media-metadata';
