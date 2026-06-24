import { Module } from '@nestjs/common';
import { IdentityModule } from 'kol/identity/identity.module';
import { NormalizationModule } from 'token/normalization/normalization.module';
import { FiltersModule } from 'token/token-gating/filters.module';
import { VipCallsModule as TelegramPublishingModule } from 'telegram/vip-calls-channel/vip-calls.module';
import { GetDashboardKpisUseCase } from 'dashboard/application/handlers/get-dashboard-kpis.use-case';
import { DashboardController } from 'dashboard/api/http/dashboard.controller';

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
  providers: [GetDashboardKpisUseCase],
})
export class DashboardModule {}
