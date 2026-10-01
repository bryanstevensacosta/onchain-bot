/**
 * @deprecated Moved to apps/feed-publisher/src/filters/ (Tramo 2, todo 3 + P18 companion).
 * Content filters now live in feed-publisher: ContentFilterService (ReDoS-safe) +
 * ChannelFilterRepository + filter CRUD use-cases (FK-less per spec). This module
 * stays wired for dual-run; it will be removed at cutover (todo 11). Do not extend
 * it — add filter logic in apps/feed-publisher/src/filters/ instead.
 *
 * New location: apps/feed-publisher/src/filters/
 * Reason: extracting feed pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal at cutover)
 * Rollback: re-enable backend path (USE_FEED_PUBLISHER=false)
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoNewsPersistenceModule } from 'telegram/ingestion/crypto-news/crypto-news-persistence.module';
import { SharedIngestionModule } from 'telegram/ingestion/shared/shared-ingestion.module';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';
import { ChannelFilterRepository } from 'telegram/ingestion/crypto-news/application/ports/channel-filter.repository';
import { TypeOrmChannelFilterRepository } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/repositories/typeorm-channel-filter.repository';
import { ContentFilterService } from 'telegram/ingestion/crypto-news/application/services/content-filter.service';
import { CryptoNewsController } from 'telegram/ingestion/crypto-news/api/http/crypto-news.controller';
import { FeedFiltersController } from 'telegram/ingestion/crypto-news/api/http/feed-filters.controller';
import { InProcessDomainEventPublisher } from 'shared/common/messaging/in-process-domain-event.publisher';
import {
  CreateFilterUseCase,
  ListFiltersUseCase,
  UpdateFilterUseCase,
  DeleteFilterUseCase,
  ToggleFilterUseCase,
} from 'telegram/ingestion/crypto-news/application/handlers/filters';

/**
 * Crypto-news ingestion sub-module (post db-separation todo 4).
 *
 * Backend keeps ONLY the content-filter slice:
 * - `channel_content_filter_configs` (channel_id opaque, no FK)
 * - Filter CRUD use cases + ContentFilterService (on-read transforms)
 * - ChannelFilterRepository (filters-only read port for matching)
 *
 * Sources/messages/media are owned by ingestion-telegram (own DB).
 * (T8 removed the message port + stub + VO and the source save/delete
 *  methods; T9 removed the source repository DI shim + in-memory impl —
 *  consumers use CryptoNewsSourceDto via ingestion-telegram HTTP.)
 *
 * Removed in todo 4: StoreNewsMessageUseCase, RegisterNewsSourceUseCase,
 * ListActiveSourceIdsUseCase, TypeOrm source/message repos (+ mappers),
 * CryptoNewsMetadataResolver, MediaRetentionCleanupScheduler (janitor
 * moved to ingestion-telegram in todo 6).
 */
@Module({
  imports: [
    ConfigModule,
    // FIX: Import persistence module separately to avoid forwardRef + TypeOrmModule deadlock
    // TypeORM entity registration MUST NOT be in the same module as forwardRef
    CryptoNewsPersistenceModule,
    // FIX: SharedIngestionModule now provides CryptoNewsMediaDownloader, breaking the circular dependency
    // Previous: CryptoNewsIngestionModule ←forwardRef→ SharedIngestionModule (mutual circular dep)
    // Now: SharedIngestionModule → CryptoNewsIngestionModule (one-way, no forwardRef needed)
    SharedIngestionModule,
  ],
  controllers: [CryptoNewsController, FeedFiltersController],
  providers: [
    TypeOrmChannelFilterRepository,
    {
      provide: ChannelFilterRepository,
      useClass: TypeOrmChannelFilterRepository,
    },
    {
      provide: CryptoNewsEventPublisher,
      useClass: InProcessDomainEventPublisher,
    },
    ContentFilterService,
    // Filter management use cases
    CreateFilterUseCase,
    ListFiltersUseCase,
    UpdateFilterUseCase,
    DeleteFilterUseCase,
    ToggleFilterUseCase,
  ],
  exports: [
    ChannelFilterRepository,
    CryptoNewsEventPublisher,
    ContentFilterService, // ← Export for CryptoNewsIntegrationModule (Opción A architecture)
  ],
})
export class CryptoNewsIngestionModule {}
