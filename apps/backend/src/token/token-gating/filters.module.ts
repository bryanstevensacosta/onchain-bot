import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { SettingsModule } from 'settings/settings.module';
import { BlacklistPort } from 'token/token-gating/domain/ports/blacklist.port';
import { FilterDecisionRepository } from 'token/token-gating/application/ports/filter-decision.repository';
import { FiltersEventPublisher } from 'token/token-gating/application/ports/filters-event.publisher';
import { ApplyFiltersUseCase } from 'token/token-gating/application/handlers/apply-filters.use-case';
import { GetFilterDecisionUseCase } from 'token/token-gating/application/handlers/get-filter-decision.use-case';
import { ListFilterDecisionsUseCase } from 'token/token-gating/application/handlers/list-filter-decisions.use-case';
import { InMemoryBlacklistAdapter } from 'token/token-gating/infrastructure/adapters/in-memory-blacklist.adapter';
import { InMemoryFilterDecisionRepository } from 'token/token-gating/infrastructure/repositories/in-memory-filter-decision.repository';
import { FilterDecisionEntity } from 'token/token-gating/infrastructure/persistence/typeorm/entities/filter-decision.entity';
import { TypeOrmFilterDecisionRepository } from 'token/token-gating/infrastructure/persistence/typeorm/repositories/typeorm-filter-decision.repository';
import { InProcessFiltersEventPublisher } from 'token/token-gating/infrastructure/messaging/in-process-filters-event.publisher';
import { TokenScoredHandler } from 'token/token-gating/infrastructure/event-bus/token-scored.handler';
import { FiltersController } from 'token/token-gating/api/http/filters.controller';

/**
 * Filters BC module — final gate before publishing.
 *
 * Consumes: `scoring.token.scored` events
 * Emits:    `filters.token.approved` or `filters.token.rejected` events
 *
 * Gates (configurable): score threshold, classification block,
 * blacklist, honeypot suspicion, risk weight, completeness, chain support.
 *
 * N18: FilterDecision persisted via TypeORM (Tier-2).
 */
@Module({
  imports: [
    SettingsModule,
    TypeOrmModule.forFeature([FilterDecisionEntity]),
  ],
  controllers: [FiltersController],
  providers: [
    ApplyFiltersUseCase,
    GetFilterDecisionUseCase,
    ListFilterDecisionsUseCase,
    TokenScoredHandler,
    { provide: BlacklistPort, useClass: InMemoryBlacklistAdapter },
    InMemoryFilterDecisionRepository,
    ...(isDatabaseEnabled() ? [TypeOrmFilterDecisionRepository] : []),
    {
      provide: FilterDecisionRepository,
      inject: [
        InMemoryFilterDecisionRepository,
        ...(isDatabaseEnabled() ? [TypeOrmFilterDecisionRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryFilterDecisionRepository,
        typeorm?: TypeOrmFilterDecisionRepository,
      ): FilterDecisionRepository => typeorm ?? inMemory,
    },
    {
      provide: FiltersEventPublisher,
      useClass: InProcessFiltersEventPublisher,
    },
  ],
  exports: [FilterDecisionRepository, FiltersEventPublisher],
})
export class FiltersModule {}
