import { Module } from '@nestjs/common';
import { BlacklistPort } from 'discovery/filters/domain/ports/blacklist.port';
import { FilterDecisionRepository } from 'discovery/filters/application/ports/filter-decision.repository';
import { FiltersEventPublisher } from 'discovery/filters/application/ports/filters-event.publisher';
import { ApplyFiltersUseCase } from 'discovery/filters/application/handlers/apply-filters.use-case';
import { GetFilterDecisionUseCase } from 'discovery/filters/application/handlers/get-filter-decision.use-case';
import { ListFilterDecisionsUseCase } from 'discovery/filters/application/handlers/list-filter-decisions.use-case';
import { InMemoryBlacklistAdapter } from 'discovery/filters/infrastructure/adapters/in-memory-blacklist.adapter';
import { InMemoryFilterDecisionRepository } from 'discovery/filters/infrastructure/repositories/in-memory-filter-decision.repository';
import { InProcessFiltersEventPublisher } from 'discovery/filters/infrastructure/messaging/in-process-filters-event.publisher';
import { TokenScoredHandler } from 'discovery/filters/infrastructure/event-bus/token-scored.handler';
import { FiltersController } from 'discovery/filters/api/http/filters.controller';

/**
 * Filters BC module — final gate before publishing.
 *
 * Consumes: `scoring.token.scored` events
 * Emits:    `filters.token.approved` or `filters.token.rejected` events
 *
 * Gates (configurable): score threshold, classification block,
 * blacklist, honeypot suspicion, risk weight, completeness, chain support.
 */
@Module({
  controllers: [FiltersController],
  providers: [
    ApplyFiltersUseCase,
    GetFilterDecisionUseCase,
    ListFilterDecisionsUseCase,
    TokenScoredHandler,
    { provide: BlacklistPort, useClass: InMemoryBlacklistAdapter },
    {
      provide: FilterDecisionRepository,
      useClass: InMemoryFilterDecisionRepository,
    },
    {
      provide: FiltersEventPublisher,
      useClass: InProcessFiltersEventPublisher,
    },
  ],
  exports: [FilterDecisionRepository, FiltersEventPublisher],
})
export class FiltersModule {}
