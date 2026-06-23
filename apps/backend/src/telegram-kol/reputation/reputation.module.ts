import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import type { AppConfig } from 'shared/common/config/app.config';
import { CallTrackingModule } from 'token/call-tracking/call-tracking.module';
import { KolReputationRepository } from 'telegram-kol/reputation/application/ports/kol-reputation.repository';
import { KnownKolPort } from 'telegram-kol/reputation/application/ports/known-kol.port';
import {
  GetKolReputationUseCase,
  GetTopKolsUseCase,
  ListAllKolReputationsUseCase,
} from 'telegram-kol/reputation/application/handlers/kol-stats-queries.use-case';
import { RecomputeKolReputationUseCase } from 'telegram-kol/reputation/application/handlers/recompute-kol-reputation.use-case';
import { InMemoryKolReputationRepository } from 'telegram-kol/reputation/infrastructure/repositories/in-memory-kol-reputation.repository';
import { DefaultKnownKolRegistry } from 'telegram-kol/reputation/infrastructure/known-kol/default-known-kol.registry';
import { KolReputationEntity } from 'telegram-kol/reputation/infrastructure/persistence/typeorm/entities/kol-reputation.entity';
import { TypeOrmKolReputationRepository } from 'telegram-kol/reputation/infrastructure/persistence/typeorm/repositories/typeorm-kol-reputation.repository';
import { KolReputationController } from 'telegram-kol/reputation/api/http/kol-reputation.controller';

/**
 * Reputation BC module (Fase 2 of the kol-refactor plan).
 *
 * Tracks per-KOL reputation stats: total calls, strong/good/neutral/poor/failed
 * counts, success rate, avg ATH multiple, confidence.
 *
 * Inputs: jobs from `token/call-tracking/` recompute stats.
 * Outputs: `KolReputation` records (TypeORM or in-memory).
 *
 * Also owns the operator-curated `KNOWN_GOOD` / `KNOWN_BAD` KOL lists
 * (via the `KnownKolPort`), consumed by `token/scoring/` so the
 * scoring adapter stays free of hardcoded magic strings.
 *
 * Persistence selection: when `DATABASE_ENABLED=true`, the TypeORM
 * Postgres-backed repository is wired as `KolReputationRepository`;
 * otherwise the in-memory one. Same pattern as `IdentityModule`'s
 * `KolRepository` (`identity.module.ts`).
 */
@Module({
  imports: [
    ConfigModule,
    CallTrackingModule,
    ...(isDatabaseEnabled()
      ? [TypeOrmModule.forFeature([KolReputationEntity])]
      : []),
  ],
  controllers: [KolReputationController],
  providers: [
    InMemoryKolReputationRepository,
    ...(isDatabaseEnabled() ? [TypeOrmKolReputationRepository] : []),
    {
      provide: KolReputationRepository,
      inject: [
        ConfigService,
        InMemoryKolReputationRepository,
        ...(isDatabaseEnabled() ? [TypeOrmKolReputationRepository] : []),
      ],
      useFactory: (
        config: ConfigService,
        inMemory: InMemoryKolReputationRepository,
        typeorm?: TypeOrmKolReputationRepository,
      ): KolReputationRepository => {
        const enabled =
          config.get<AppConfig>('app')?.database?.enabled === true;
        return enabled && typeorm ? typeorm : inMemory;
      },
    },
    {
      provide: KnownKolPort,
      useClass: DefaultKnownKolRegistry,
    },
    GetKolReputationUseCase,
    GetTopKolsUseCase,
    ListAllKolReputationsUseCase,
    RecomputeKolReputationUseCase,
  ],
  exports: [KolReputationRepository, KnownKolPort],
})
export class ReputationModule {}
