import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { ExtractionModule } from 'token/intake/extraction/extraction.module';
import { ParsingModule } from 'token/intake/parsing/parsing.module';
import { KolEventPublisher } from 'kol/identity/application/ports/kol-event.publisher';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';
import { InProcessDomainEventPublisher } from 'shared/common/messaging/in-process-domain-event.publisher';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { ResolvedKolMetadataRepository } from 'kol/identity/application/ports/resolved-kol-metadata.repository';
import { RegisterKolUseCase } from 'kol/identity/application/handlers/register-kol.use-case';
import { GetKolUseCase } from 'kol/identity/application/handlers/get-kol.use-case';
import { ListKolsUseCase } from 'kol/identity/application/handlers/list-kols.use-case';
import { ListActiveKolIdsUseCase } from 'kol/identity/application/handlers/list-active-kol-ids.use-case';
import { SetKolLifecycleUseCase } from 'kol/identity/application/handlers/set-kol-lifecycle.use-case';
import { InMemoryKolRepository } from 'kol/identity/infrastructure/repositories/in-memory-kol.repository';
import { JsonResolvedKolMetadataRepository } from 'kol/identity/infrastructure/persistence/json-resolved-kol-metadata.repository';
import { TypeOrmKolRepository } from 'kol/identity/infrastructure/persistence/typeorm/repositories/typeorm-kol.repository';
import { KolEntity } from 'kol/identity/infrastructure/persistence/typeorm/entities/kol.entity';
import { KolController } from 'kol/identity/api/http/kol.controller';
import type { AppConfig } from 'shared/common/config/app.config';

/**
 * Identity BC module (Fase 1 + Fase 4 of the kol-refactor plan).
 *
 * Owns the KOL aggregate, lifecycle (ACTIVE/DORMANT/BLACKLISTED), the
 * resolved-metadata cache, the bridge use case, and the event publisher.
 * Telegram ingestion engine is provided by `TelegramIngestionModule` (global).
 */
@Module({
  imports: [
    ConfigModule,
    ExtractionModule,
    ParsingModule,
    TypeOrmModule.forFeature([KolEntity]),
  ],
  controllers: [KolController],
  providers: [
    RegisterKolUseCase,
    GetKolUseCase,
    ListKolsUseCase,
    ListActiveKolIdsUseCase,
    SetKolLifecycleUseCase,
    InMemoryKolRepository,
    ...(isDatabaseEnabled() ? [TypeOrmKolRepository] : []),
    {
      provide: KolRepository,
      inject: [
        ConfigService,
        InMemoryKolRepository,
        ...(isDatabaseEnabled() ? [TypeOrmKolRepository] : []),
      ],
      useFactory: (
        config: ConfigService,
        inMemory: InMemoryKolRepository,
        typeorm?: TypeOrmKolRepository,
      ): KolRepository => {
        const enabled =
          config.get<AppConfig>('app')?.database?.enabled === true;
        return enabled && typeorm ? typeorm : inMemory;
      },
    },
    {
      provide: ResolvedKolMetadataRepository,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const cfg = config.get<AppConfig>('app');
        const filePath =
          cfg?.ingestion?.telegram?.metadataCache?.filePath ??
          `${process.cwd()}/.cache/kol-metadata.json`;
        return new JsonResolvedKolMetadataRepository(filePath);
      },
    },
    KolIngestionOrchestratorUseCase,
    {
      provide: KolEventPublisher,
      useClass: InProcessDomainEventPublisher,
    },
  ],
  exports: [
    KolRepository,
    ResolvedKolMetadataRepository,
    KolEventPublisher,
    RegisterKolUseCase,
    KolIngestionOrchestratorUseCase,
  ],
})
export class IdentityModule {}
