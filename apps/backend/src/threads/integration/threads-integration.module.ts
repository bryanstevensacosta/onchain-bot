/**
 * @deprecated Moved to apps/feed-publisher/src/threads/ (matching side; Tramo 2, todo 8 + P18 companion).
 * Threads fetch→filter→enqueue now lives in feed-publisher: FilteredThreadsService +
 * EnqueueThreadsCronScheduler + ThreadsMatchingConfig (threads esqueleto v1). This
 * module stays wired for dual-run; it will be removed at cutover (todo 11). Do not
 * extend it — add threads matching logic in apps/feed-publisher/src/threads/ instead.
 *
 * New location: apps/feed-publisher/src/threads/
 * Reason: extracting feed pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal at cutover)
 * Rollback: re-enable backend path (USE_FEED_PUBLISHER=false)
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThreadsIngestionClient } from 'threads/integration/infrastructure/http/threads-ingestion-client.service';
import { FilteredThreadsService } from 'threads/integration/application/services/filtered-threads.service';
import { ProcessThreadsMessageHandler } from 'threads/integration/application/handlers/process-threads-message.handler';
import { EnqueueThreadsCronScheduler } from 'threads/integration/application/scheduling/enqueue-threads-cron.scheduler';
import { ThreadsMatchingConfigEntity } from 'threads/integration/infrastructure/persistence/typeorm/entities/threads-matching-config.entity';
import { TypeOrmThreadsMatchingConfigRepository } from 'threads/integration/infrastructure/persistence/typeorm/repositories/typeorm-threads-matching-config.repository';
import { ThreadsMatchingConfigRepository } from 'threads/integration/application/ports/threads-matching-config.repository';
import { ThreadsMatchingHealthState } from 'threads/integration/application/state/threads-matching-health.state';
import { ThreadsMatchingConfigController } from 'threads/integration/api/http/threads-matching-config.controller';

// Import-only reuse of the crypto-news filter slice (public module exports
// of `CryptoNewsIngestionModule` — ContentFilterService +
// ChannelFilterRepository; the filter ENTITY is never imported). The
// telegram/** tree is NEVER edited by this module (import-only invariant).
import { CryptoNewsIngestionModule } from 'telegram/ingestion/crypto-news/crypto-news-ingestion.module';
// Threads publisher BC (T2): queue repo + enqueue use case.
import { ThreadsPublisherModule } from 'threads/publisher/threads-publisher.module';

/**
 * ThreadsIntegrationModule - Orchestrates fetch→filter→enqueue pipeline
 * for the threads publisher.
 *
 * Threads-typed mirror of crypto `CryptoNewsIntegrationModule`
 * (`telegram/crypto-news-integration/crypto-news-integration.module.ts:91`):
 * - Ingestion-service stores RAW crypto-news messages (no filters)
 * - Backend polls ingestion-telegram HTTP API (ThreadsIngestionClient —
 *   SAME `/api/feed/messages` feed, zero ingestion-telegram changes)
 * - Backend applies ContentFilterService + threads keyword matching
 *   on-read (FilteredThreadsService)
 * - Matched messages are enqueued for threads LLM processing
 *   (EnqueueThreadsCronScheduler: literal every-5-min SSE-fallback /
 *   every-1-min primary — no AppConfig read, zero T3 dependency)
 *
 * **Module responsibilities:**
 * 1. Provide ThreadsIngestionClient (HTTP fetch from ingestion-telegram)
 * 2. Provide FilteredThreadsService (filter + match orchestrator)
 * 3. Register EnqueueThreadsCronScheduler (dual literal @Cron)
 * 4. Serve GET|PATCH threads/matching/config + GET threads/matching/health
 *
 * **Cross-BC dependencies:**
 * - CryptoNewsIngestionModule — provides (import-only, never edited):
 *   - ContentFilterService (regex transforms)
 *   - ChannelFilterRepository (per-channel filters)
 * - ThreadsPublisherModule (T2, extended by T4/T6) — provides:
 *   - ThreadsQueueRepository (dedup + depth)
 *   - ThreadsKeywordRepository (keyword matching)
 *   - ThreadsBlacklistPhraseRepository (blacklist matching)
 *   - EnqueueThreadsMessageUseCase (enqueue logic, cap 100)
 *
 * **Wiring notes:**
 * - Keyword/blacklist repos are bound to the in-memory adapters until T4
 *   wires the TypeORM adapters + HTTP CRUD (same swap crypto did).
 * - EnqueueThreadsCronScheduler is registered as provider (NestJS @Cron
 *   auto-discovers the two literal expressions).
 * - ConfigModule is @Global, no need to import.
 * - NOT registered in AppModule here — wiring lands with T4/T7 (same as
 *   T2's ThreadsPublisherModule).
 */
@Module({
  imports: [
    // TypeORM entity for threads matching config
    TypeOrmModule.forFeature([ThreadsMatchingConfigEntity]),

    // Import modules that provide required repositories + services
    CryptoNewsIngestionModule, // ContentFilterService, ChannelFilterRepository
    ThreadsPublisherModule, // ThreadsQueueRepository, EnqueueThreadsMessageUseCase
  ],
  controllers: [ThreadsMatchingConfigController],
  providers: [
    // HTTP client for ingestion-telegram
    ThreadsIngestionClient,

    // Filter + match orchestrator
    FilteredThreadsService,

    // Threads matching config repository
    {
      provide: ThreadsMatchingConfigRepository,
      useClass: TypeOrmThreadsMatchingConfigRepository,
    },

    // Keyword/blacklist repos resolve from ThreadsPublisherModule (single
    // store shared with T4's controllers — re-providing would split it).

    // In-memory matching health (mutated by the cron tick, read by GET health)
    ThreadsMatchingHealthState,

    // SSE event handler (real-time crypto-news → threads processing)
    ProcessThreadsMessageHandler,

    // Cron scheduler (auto-registered by NestJS @Cron decorators)
    EnqueueThreadsCronScheduler,
  ],
  exports: [
    // Export ThreadsMatchingConfigRepository so other modules can read the flag
    ThreadsMatchingConfigRepository,
    // Export ProcessThreadsMessageHandler so a future coordinator can route SSE events
    ProcessThreadsMessageHandler,
    // Export FilteredThreadsService for admin tooling / manual triggers
    FilteredThreadsService,
  ],
})
export class ThreadsIntegrationModule {}
