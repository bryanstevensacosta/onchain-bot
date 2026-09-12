import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoNewsIngestionClient } from 'telegram/crypto-news-integration/infrastructure/http/crypto-news-ingestion-client.service';
import { FilteredCryptoNewsService } from 'telegram/crypto-news-integration/application/services/filtered-crypto-news.service';
import { ProcessCryptoNewsMessageHandler } from 'telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler';
import { EnqueueMatchingCronScheduler } from 'telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler';
import { MatchingConfigEntity } from 'telegram/crypto-news-integration/infrastructure/persistence/typeorm/entities/matching-config.entity';
import { TypeOrmMatchingConfigRepository } from 'telegram/crypto-news-integration/infrastructure/persistence/typeorm/repositories/typeorm-matching-config.repository';
import { MatchingConfigRepository } from 'telegram/crypto-news-integration/application/ports/matching-config.repository';
import { MatchingHealthState } from 'telegram/crypto-news-integration/application/state/matching-health.state';
import { MatchingConfigController } from 'telegram/crypto-news-integration/api/http/matching-config.controller';

// Import dependencies from other BCs (cross-BC imports — documented in gap 7)
import { CryptoNewsIngestionModule } from 'telegram/ingestion/crypto-news/crypto-news-ingestion.module';
import { CryptoNewsPublisherModule } from 'telegram/crypto-news-publisher/crypto-news-publisher.module';

/**
 * CryptoNewsIntegrationModule - Orchestrates fetch→filter→enqueue pipeline
 *
 * **Per Opción A architecture:**
 * - Ingestion-service stores RAW crypto-news messages (no filters)
 * - Backend polls ingestion-service HTTP API (CryptoNewsIngestionClient)
 * - Backend applies ContentFilterService + keyword matching on-read (FilteredCryptoNewsService)
 * - Matched messages are enqueued for LLM processing (EnqueueMatchingCronScheduler)
 *
 * **Module responsibilities:**
 * 1. Provide CryptoNewsIngestionClient (HTTP fetch from ingestion-service)
 * 2. Provide FilteredCryptoNewsService (filter + match orchestrator)
 * 3. Register EnqueueMatchingCronScheduler (cron every minute)
 *
 * **Cross-BC dependencies (documented in apps/backend/AGENTS.md gap 7):**
 * - CryptoNewsIngestionModule — provides:
 *   - ContentFilterService (regex transforms)
 *   - ChannelFilterRepository (per-channel filters)
 * - CryptoNewsPublisherModule — provides:
 *   - KeywordRepository (keyword matching)
 *   - BlacklistPhraseRepository (blacklist matching)
 *   - EnqueueMatchingMessageUseCase (enqueue logic)
 *
 * **Wiring notes:**
 * - This module does NOT export any providers (internal orchestration only)
 * - EnqueueMatchingCronScheduler is registered as provider (NestJS @Cron auto-discovers)
 * - ConfigModule is @Global, no need to import
 *
 * **Replaces:**
 * - CryptoNewsMessageIngestedHandler (event-driven, local ingestion)
 * - Backend no longer ingests crypto-news via MTProto/SSE
 * - Backend only polls ingestion-service HTTP API
 *
 * @module CryptoNewsIntegrationModule
 */
@Module({
  imports: [
    // TypeORM entity for matching config
    TypeOrmModule.forFeature([MatchingConfigEntity]),

    // Import modules that provide required repositories + services
    CryptoNewsIngestionModule, // ContentFilterService, ChannelFilterRepository
    CryptoNewsPublisherModule, // KeywordRepository, BlacklistPhraseRepository, EnqueueMatchingMessageUseCase
  ],
  controllers: [MatchingConfigController],
  providers: [
    // HTTP client for ingestion-service
    CryptoNewsIngestionClient,

    // Filter + match orchestrator
    FilteredCryptoNewsService,

    // Matching config repository
    {
      provide: MatchingConfigRepository,
      useClass: TypeOrmMatchingConfigRepository,
    },

    // In-memory matching health (mutated by the cron tick, read by GET health)
    MatchingHealthState,

    // SSE event handler (real-time crypto-news processing)
    ProcessCryptoNewsMessageHandler,

    // Cron scheduler (auto-registered by NestJS @Cron decorator)
    EnqueueMatchingCronScheduler,
  ],
  exports: [
    // Export MatchingConfigRepository so other modules can read/write the flag
    MatchingConfigRepository,
    // Export ProcessCryptoNewsMessageHandler so IngestionCoordinator can route SSE events
    ProcessCryptoNewsMessageHandler,
  ],
})
export class CryptoNewsIntegrationModule {}
