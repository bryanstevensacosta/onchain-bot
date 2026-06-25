import { Module } from '@nestjs/common';
import { IdentityModule } from 'kol/identity/identity.module';
import { NormalizationModule } from 'token/normalization/normalization.module';
import { FiltersModule } from 'token/token-gating/filters.module';
import { VipCallsModule as TelegramPublishingModule } from 'telegram/vip-calls-channel/vip-calls.module';
import { GetDashboardKpisUseCase } from 'dashboard/application/handlers/get-dashboard-kpis.use-case';
import { DashboardController } from 'dashboard/api/http/dashboard.controller';
import { DashboardKpisCachePort } from 'dashboard/application/ports/dashboard-kpis-cache.port';
import { InMemoryDashboardKpisCacheRepository } from 'dashboard/infrastructure/repositories/in-memory-dashboard-kpis-cache.repository';
import { KpisUpdatedEventPublisher } from 'dashboard/application/ports/kpis-updated-event.publisher';
import { InProcessKpisUpdatedEventPublisher } from 'dashboard/infrastructure/messaging/in-process-kpis-updated-event.publisher';
import { RefreshKpisService } from 'dashboard/application/services/refresh-kpis.service';

/**
 * Dashboard BC.
 *
 * Cross-BC read-only aggregator. Depends on the application ports of
 * KOL identity, normalization, token-gating and publishing — does not
 * touch their internals.
 */
@Module({
  imports: [
    IdentityModule,
    NormalizationModule,
    FiltersModule,
    TelegramPublishingModule,
  ],
  controllers: [DashboardController],
  providers: [
    GetDashboardKpisUseCase,
    InMemoryDashboardKpisCacheRepository,
    {
      provide: DashboardKpisCachePort,
      useExisting: InMemoryDashboardKpisCacheRepository,
    },
    InProcessKpisUpdatedEventPublisher,
    {
      provide: KpisUpdatedEventPublisher,
      useExisting: InProcessKpisUpdatedEventPublisher,
    },
    RefreshKpisService,
  ],
  exports: [DashboardKpisCachePort, KpisUpdatedEventPublisher],
})
export class DashboardModule {}
