import { Module } from '@nestjs/common';
import { ChannelFilterRepository } from './application/ports/channel-filter.repository';
import { ContentFilterService } from './application/services/content-filter.service';
import { ContentFilterUseCases } from './application/use-cases/content-filter.use-cases';
import { InMemoryChannelFilterRepository } from './infrastructure/persistence/in-memory/in-memory-channel-filter.repository';
import { FiltersController } from './api/http/filters.controller';
import { FiltersHealthIndicator } from './health/filters-health.indicator';

/**
 * FiltersModule (Tramo 2, todo 3).
 *
 * Owns ContentFilterService (ReDoS-safe regex transforms, applied on-read)
 * + per-channel rule CRUD. Live binding is the in-memory adapter; the
 * TypeORM shape ships unwired (GAP-1). Exports the repository and the
 * service for the matching module.
 */
@Module({
  controllers: [FiltersController],
  providers: [
    ContentFilterService,
    ContentFilterUseCases,
    FiltersHealthIndicator,
    {
      provide: ChannelFilterRepository,
      useClass: InMemoryChannelFilterRepository,
    },
  ],
  exports: [
    ChannelFilterRepository,
    ContentFilterService,
    FiltersHealthIndicator,
  ],
})
export class FiltersModule {}
