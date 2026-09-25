/**
 * @deprecated Moved to apps/kol-system/src/telegram/ (+ templates orchestration in
 * apps/kol-system/src/templates/) (Tramo 1, todo 11 + P18 companion). Publishing multi-bot
 * now lives in kol-system: PublishingJob + PublishFromTemplate + ManualPublish via
 * MultiBotPublisherAdapter (P14: `vip-calls` is a template SEED name, never a module).
 * Ticker never null pre-publisher (invariant kept both sides). This module stays wired
 * for dual-run; it will be removed in todo 16 (cutover + cleanup). Do not extend it —
 * add publishing logic in apps/kol-system/src/telegram/ instead.
 *
 * New location: apps/kol-system/src/telegram/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChainRegistryModule } from 'chain/registry/chain-registry.module';
import {
  PublishedCallRepository,
  PublishingEventPublisher,
} from 'telegram/shared';
import { InMemoryPublishedCallRepository } from './infrastructure/repositories/in-memory-published-call.repository';
import { TypeOrmPublishedCallRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-published-call.repository';
import { PublishedCallEntity } from './infrastructure/persistence/typeorm/entities/published-call.entity';
import { InProcessDomainEventPublisher } from 'shared/common/messaging/in-process-domain-event.publisher';
import { VipCallsPublishUseCase } from './application/handlers/vip-calls-publish.use-case';
import { VipCallsListPublishedUseCase } from './application/handlers/vip-calls-list-published.use-case';
import { ReconcileStuckReservationsUseCase } from './application/handlers/reconcile-stuck-reservations.use-case';
import { VipCallsController } from './api/http/vip-calls.controller';
import { TokenApprovedPublishHandler } from './infrastructure/event-bus/token-approved-publish.handler';
import { ReconcileStuckReservationsScheduler } from './infrastructure/schedulers/reconcile-stuck-reservations.scheduler';
import { SettingsModule } from 'settings/settings.module';
import { NormalizationModule } from 'token/normalization/normalization.module';
import { EnrichmentModule } from 'token/enrichment/enrichment.module';
import { VipAchievementModule } from '../vip-achievement/vip-achievement.module';
import { TickerResolverService } from './application/services/ticker-resolver.service';

@Module({
  imports: [
    HttpModule,
    ChainRegistryModule,
    SettingsModule,
    NormalizationModule,
    EnrichmentModule,
    VipAchievementModule,
    TypeOrmModule.forFeature([PublishedCallEntity]),
  ],
  controllers: [VipCallsController],
  providers: [
    VipCallsPublishUseCase,
    VipCallsListPublishedUseCase,
    ReconcileStuckReservationsUseCase,
    ReconcileStuckReservationsScheduler,
    TokenApprovedPublishHandler,
    TickerResolverService,
    InMemoryPublishedCallRepository,
    ...(isDatabaseEnabled() ? [TypeOrmPublishedCallRepository] : []),
    {
      provide: PublishedCallRepository,
      inject: [
        ...(isDatabaseEnabled()
          ? [TypeOrmPublishedCallRepository]
          : [InMemoryPublishedCallRepository]),
      ],
      useFactory: (repo: PublishedCallRepository): PublishedCallRepository =>
        repo,
    },
    {
      provide: PublishingEventPublisher,
      useClass: InProcessDomainEventPublisher,
    },
  ],
  exports: [PublishedCallRepository, PublishingEventPublisher],
})
export class VipCallsModule {}
