import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import type { AppConfig } from 'shared/common/config/app.config';
import { CryptoNewsSourceEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-source.entity';
import { CryptoNewsMessageEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';
import { InMemoryCryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-source.repository';
import { InMemoryCryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-message.repository';
import { TypeOrmCryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/repositories/typeorm-crypto-news-source.repository';
import { TypeOrmCryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/repositories/typeorm-crypto-news-message.repository';
import { InProcessCryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/infrastructure/messaging/in-process-crypto-news-event.publisher';
import { RegisterNewsSourceUseCase } from 'telegram/ingestion/crypto-news/application/handlers/register-news-source.use-case';
import { StoreNewsMessageUseCase } from 'telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case';
import { CryptoNewsSeeder } from 'telegram/ingestion/crypto-news/infrastructure/seeders/crypto-news.seeder';

/**
 * Crypto-news ingestion sub-module.
 *
 * Provides: ports, use cases, repositories, event publisher, seeder.
 * Wires TypeORM (when DATABASE_ENABLED) or in-memory (dev/tests) repos.
 *
 * No NestJS module imports from kol/ — dependencies on
 * RegisterKolUseCase, KolRepository, etc. are resolved via DI through
 * IdentityModule when IngestionCoordinator consumes them.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([CryptoNewsSourceEntity, CryptoNewsMessageEntity]),
  ],
  providers: [
    InMemoryCryptoNewsSourceRepository,
    InMemoryCryptoNewsMessageRepository,
    ...(isDatabaseEnabled()
      ? [TypeOrmCryptoNewsSourceRepository, TypeOrmCryptoNewsMessageRepository]
      : []),
    {
      provide: CryptoNewsSourceRepository,
      inject: [ConfigService, InMemoryCryptoNewsSourceRepository, TypeOrmCryptoNewsSourceRepository],
      useFactory: (
        config: ConfigService,
        inMemory: InMemoryCryptoNewsSourceRepository,
        typeorm: TypeOrmCryptoNewsSourceRepository,
      ): CryptoNewsSourceRepository => {
        const enabled = config.get<AppConfig>('app')?.database?.enabled === true;
        return enabled ? typeorm : inMemory;
      },
    },
    {
      provide: CryptoNewsMessageRepository,
      inject: [ConfigService, InMemoryCryptoNewsMessageRepository, TypeOrmCryptoNewsMessageRepository],
      useFactory: (
        config: ConfigService,
        inMemory: InMemoryCryptoNewsMessageRepository,
        typeorm: TypeOrmCryptoNewsMessageRepository,
      ): CryptoNewsMessageRepository => {
        const enabled = config.get<AppConfig>('app')?.database?.enabled === true;
        return enabled ? typeorm : inMemory;
      },
    },
    {
      provide: CryptoNewsEventPublisher,
      useClass: InProcessCryptoNewsEventPublisher,
    },
    RegisterNewsSourceUseCase,
    StoreNewsMessageUseCase,
    CryptoNewsSeeder,
  ],
  exports: [
    CryptoNewsSourceRepository,
    CryptoNewsMessageRepository,
    CryptoNewsEventPublisher,
    RegisterNewsSourceUseCase,
    StoreNewsMessageUseCase,
    CryptoNewsSeeder,
  ],
})
export class CryptoNewsIngestionModule {}
