import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoNewsPersistenceModule } from 'telegram/ingestion/crypto-news/crypto-news-persistence.module';
import { SharedIngestionModule } from 'telegram/ingestion/shared/shared-ingestion.module';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';
import { ChannelFilterRepository } from 'telegram/ingestion/crypto-news/application/ports/channel-filter.repository';
import { InMemoryCryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-source.repository';
import { InMemoryCryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-message.repository';
import { TypeOrmChannelFilterRepository } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/repositories/typeorm-channel-filter.repository';
import { ContentFilterService } from 'telegram/ingestion/crypto-news/application/services/content-filter.service';
import { CryptoNewsController } from 'telegram/ingestion/crypto-news/api/http/crypto-news.controller';
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
 * Sources/messages/media are owned by ingestion-service (own DB).
 * The legacy source/message repository tokens are still provided
 * (in-memory) because `crypto-news-publisher` (QueueController,
 * CryptoNewsMessageIngestedHandler) injects them — they resolve to
 * empty stores since the backend no longer persists crypto-news.
 *
 * Removed in todo 4: StoreNewsMessageUseCase, RegisterNewsSourceUseCase,
 * ListActiveSourceIdsUseCase, TypeOrm source/message repos (+ mappers),
 * CryptoNewsMetadataResolver, MediaRetentionCleanupScheduler (janitor
 * moved to ingestion-service in todo 6).
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
  controllers: [CryptoNewsController],
  providers: [
    InMemoryCryptoNewsSourceRepository,
    InMemoryCryptoNewsMessageRepository,
    TypeOrmChannelFilterRepository,
    {
      provide: CryptoNewsSourceRepository,
      useClass: InMemoryCryptoNewsSourceRepository,
    },
    {
      provide: CryptoNewsMessageRepository,
      useClass: InMemoryCryptoNewsMessageRepository,
    },
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
    CryptoNewsSourceRepository,
    CryptoNewsMessageRepository,
    ChannelFilterRepository,
    CryptoNewsEventPublisher,
    ContentFilterService, // ← Export for CryptoNewsIntegrationModule (Opción A architecture)
  ],
})
export class CryptoNewsIngestionModule {}
