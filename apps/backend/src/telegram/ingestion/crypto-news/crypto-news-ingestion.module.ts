import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CryptoNewsPersistenceModule } from 'telegram/ingestion/crypto-news/crypto-news-persistence.module';
import { SharedIngestionModule } from 'telegram/ingestion/shared/shared-ingestion.module';
import type { AppConfig } from 'shared/common/config/app.config';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';
import { InMemoryCryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-source.repository';
import { InMemoryCryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-message.repository';
import { TypeOrmCryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/repositories/typeorm-crypto-news-source.repository';
import { TypeOrmCryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/repositories/typeorm-crypto-news-message.repository';
import { RegisterNewsSourceUseCase } from 'telegram/ingestion/crypto-news/application/handlers/register-news-source.use-case';
import { ListActiveSourceIdsUseCase } from 'telegram/ingestion/crypto-news/application/handlers/list-active-source-ids.use-case';
import { StoreNewsMessageUseCase } from 'telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case';
import { CryptoNewsMetadataResolver } from 'telegram/ingestion/crypto-news/application/services/crypto-news-metadata-resolver.service';
import { ContentFilterService } from 'telegram/ingestion/crypto-news/application/services/content-filter.service';
import { MediaRetentionCleanupScheduler } from 'telegram/ingestion/crypto-news/infrastructure/scheduling/media-retention-cleanup.scheduler';
import { CryptoNewsSeeder } from 'telegram/ingestion/crypto-news/infrastructure/seeders/crypto-news.seeder';
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
 * Crypto-news ingestion sub-module.
 *
 * Provides: ports, use cases, repositories, event publisher, seeder,
 * and the MTProto media downloader (for photos attached to news
 * messages). Wires TypeORM (when DATABASE_ENABLED) or in-memory
 * (dev/tests) repos.
 *
 * The media downloader factory injects `TelegramMtprotoListenerAdapter`
 * to access the lazy-initialised `TelegramClient` via `getClient()`.
 *
 * No NestJS module imports from kol/ — dependencies on
 * RegisterKolUseCase, KolRepository, etc. are resolved via DI through
 * IdentityModule when IngestionCoordinator consumes them.
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
    // TypeORM repos are always registered so their `useFactory` branches
    // can resolve them when DATABASE_ENABLED is true at runtime. Using
    // `isDatabaseEnabled()` at top-level here would fail because dotenv
    // has not yet loaded .env.dev when this module is imported.
    TypeOrmCryptoNewsSourceRepository,
    TypeOrmCryptoNewsMessageRepository,
    {
      provide: CryptoNewsSourceRepository,
      inject: [
        ConfigService,
        InMemoryCryptoNewsSourceRepository,
        TypeOrmCryptoNewsSourceRepository,
      ],
      useFactory: (
        config: ConfigService,
        inMemory: InMemoryCryptoNewsSourceRepository,
        typeorm: TypeOrmCryptoNewsSourceRepository,
      ): CryptoNewsSourceRepository => {
        const enabled =
          config.get<AppConfig>('app')?.database?.enabled === true;
        return enabled ? typeorm : inMemory;
      },
    },
    {
      provide: CryptoNewsMessageRepository,
      inject: [
        ConfigService,
        InMemoryCryptoNewsMessageRepository,
        TypeOrmCryptoNewsMessageRepository,
      ],
      useFactory: (
        config: ConfigService,
        inMemory: InMemoryCryptoNewsMessageRepository,
        typeorm: TypeOrmCryptoNewsMessageRepository,
      ): CryptoNewsMessageRepository => {
        const enabled =
          config.get<AppConfig>('app')?.database?.enabled === true;
        return enabled ? typeorm : inMemory;
      },
    },
    {
      provide: CryptoNewsEventPublisher,
      useClass: InProcessDomainEventPublisher,
    },
    // CryptoNewsMediaDownloader is now provided by SharedIngestionModule (moved to break circular dep)
    RegisterNewsSourceUseCase,
    ListActiveSourceIdsUseCase,
    StoreNewsMessageUseCase,
    CryptoNewsSeeder,
    CryptoNewsMetadataResolver,
    // Hourly cleanup of media rows + files older than the retention
    // window (Todo 3). Injects DataSource (TypeORM global) +
    // ConfigService (ConfigModule global). The cron is a no-op when
    // `dataSource.options.type !== 'postgres'` (in-memory repos).
    MediaRetentionCleanupScheduler,
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
    CryptoNewsEventPublisher,
    ContentFilterService, // ← Export for CryptoNewsIntegrationModule (Opción A architecture)
    // CryptoNewsMediaDownloader is now exported by SharedIngestionModule
    RegisterNewsSourceUseCase,
    StoreNewsMessageUseCase,
    CryptoNewsSeeder,
    CryptoNewsMetadataResolver,
  ],
})
export class CryptoNewsIngestionModule {}
