import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { KolIngestionModule } from 'telegram-kol/ingestion/kol-ingestion.module';
import { KolRepository } from 'telegram-kol/identity/application/ports/kol.repository';
import { ResolvedKolMetadataRepository } from 'telegram-kol/identity/application/ports/resolved-kol-metadata.repository';
import { RegisterKolUseCase } from 'telegram-kol/identity/application/handlers/register-kol.use-case';
import { GetKolUseCase } from 'telegram-kol/identity/application/handlers/get-kol.use-case';
import { ListKolsUseCase } from 'telegram-kol/identity/application/handlers/list-kols.use-case';
import { SetKolLifecycleUseCase } from 'telegram-kol/identity/application/handlers/set-kol-lifecycle.use-case';
import { InMemoryKolRepository } from 'telegram-kol/identity/infrastructure/repositories/in-memory-kol.repository';
import { JsonResolvedKolMetadataRepository } from 'telegram-kol/identity/infrastructure/persistence/json-resolved-kol-metadata.repository';
import { TypeOrmKolRepository } from 'telegram-kol/identity/infrastructure/persistence/typeorm/repositories/typeorm-kol.repository';
import { KolEntity } from 'telegram-kol/identity/infrastructure/persistence/typeorm/entities/kol.entity';
import { KolController } from 'telegram-kol/identity/api/http/kol.controller';
import { KolSeeder } from 'telegram-kol/identity/infrastructure/seeders/kol.seeder';
import type { AppConfig } from 'shared/common/config/app.config';

/**
 * Identity BC module (Fase 1 + Fase 4 of the kol-refactor plan).
 *
 * Owns the KOL aggregate, lifecycle (ACTIVE/DORMANT/BLACKLISTED), and
 * the resolved-metadata cache. Imports `KolIngestionModule` for the
 * `KolRepository` (re-exposed), `KolEventPublisher`, `KolListenerPort`,
 * and `StartKolIngestionUseCase`.
 */
@Module({
  imports: [
    ConfigModule,
    KolIngestionModule,
    ...(isDatabaseEnabled() ? [TypeOrmModule.forFeature([KolEntity])] : []),
  ],
  controllers: [KolController],
  providers: [
    RegisterKolUseCase,
    GetKolUseCase,
    ListKolsUseCase,
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
          `${process.cwd()}/.cache/telegram-kol-metadata.json`;
        return new JsonResolvedKolMetadataRepository(filePath);
      },
    },
    KolSeeder,
  ],
  exports: [KolRepository, ResolvedKolMetadataRepository],
})
export class IdentityModule {}
