import { Module } from '@nestjs/common';
import { IdentityModule } from 'kol/identity/identity.module';
import { NormalizationModule } from 'token/normalization/normalization.module';
import { VipCallApprovalModule } from 'token/vip-call-approval/vip-call-approval.module';
import { VipCallsModule as TelegramPublishingModule } from 'telegram/vip-calls/vip-channel/vip-channel.module';
import { GetDashboardKpisUseCase } from 'dashboard/application/handlers/get-dashboard-kpis.use-case';
import { DashboardController } from 'dashboard/api/http/dashboard.controller';
import { DashboardKpisCachePort } from 'dashboard/application/ports/dashboard-kpis-cache.port';
import { InMemoryDashboardKpisCacheRepository } from 'dashboard/infrastructure/repositories/in-memory-dashboard-kpis-cache.repository';
import { KpisUpdatedEventPublisher } from 'dashboard/application/ports/kpis-updated-event.publisher';
import { RefreshKpisService } from 'dashboard/application/services/refresh-kpis.service';
import { InProcessDomainEventPublisher } from 'shared/common/messaging/in-process-domain-event.publisher';

/**
 * Dashboard BC.
 *
 * Cross-BC read-only aggregator. Depends on the application ports of
 * KOL identity, normalization, vip-call-approval and publishing — does not
 * touch their internals.
 */
@Module({
  imports: [
    IdentityModule,
    NormalizationModule,
    VipCallApprovalModule,
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
    InProcessDomainEventPublisher,
    {
      provide: KpisUpdatedEventPublisher,
      useExisting: InProcessDomainEventPublisher,
    },
    RefreshKpisService,
  ],
  exports: [DashboardKpisCachePort, KpisUpdatedEventPublisher],
})
export class DashboardModule {}
