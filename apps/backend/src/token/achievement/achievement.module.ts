import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnrichmentModule } from 'token/enrichment/enrichment.module';
import { AchievementThresholdEntity } from './domain/entities/achievement-threshold.entity';
import { MonitoredCallEntity } from './domain/entities/monitored-call.entity';
import { DetectCrossedAchievementsService } from './application/services/detect-crossed-achievements.service';
import { RecordNotifiedAchievementUseCase } from './application/handlers/record-notified-achievement.use-case';
import { RegisterMonitoredCallUseCase } from './application/handlers/register-monitored-call.use-case';
import { EvaluateActiveCallsUseCase } from './application/handlers/evaluate-active-calls.use-case';
import { TypeormAchievementThresholdRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-achievement-threshold.repository';
import { TypeormMonitoredCallRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-monitored-call.repository';
import { InMemoryAchievementThresholdRepository } from './infrastructure/repositories/in-memory-achievement-threshold.repository';
import { InMemoryMonitoredCallRepository } from './infrastructure/repositories/in-memory-monitored-call.repository';
import { DexScreenerLiveMarketDataAdapter } from './infrastructure/adapters/dexscreener-live-market-data.adapter';
import { RedisAchievementCacheAdapter } from './infrastructure/adapters/redis-achievement-cache.adapter';
import { InMemoryAchievementCacheAdapter } from './infrastructure/adapters/in-memory-achievement-cache.adapter';
import { SettingsAchievementSettingsAdapter } from './infrastructure/adapters/settings-achievement-settings.adapter';
import { RegisterCallForAchievementsHandler } from './infrastructure/event-bus/register-call-for-achievements.handler';
import { InProcessDomainEventPublisher } from 'shared/common/messaging/in-process-domain-event.publisher';
import { DefaultThresholdsSeedService } from './infrastructure/default-thresholds-seed.service';
import { LiveAchievementScheduler } from './infrastructure/scheduling/live-achievement.scheduler';
import { AchievementController } from './api/http/achievement.controller';
import {
  AchievementCachePort,
  AchievementEventPublisher,
  AchievementSettingsPort,
  AchievementThresholdRepository,
  MonitoredCallRepository,
  LiveMarketDataPort,
} from './application/ports/index-export';

const PERSISTED_ENTITIES = [
  AchievementThresholdEntity,
  MonitoredCallEntity,
];

@Module({
  imports: [EnrichmentModule, TypeOrmModule.forFeature(PERSISTED_ENTITIES)],
  controllers: [AchievementController],
  providers: [
    DetectCrossedAchievementsService,
    RecordNotifiedAchievementUseCase,
    RegisterMonitoredCallUseCase,
    EvaluateActiveCallsUseCase,
    DefaultThresholdsSeedService,
    LiveAchievementScheduler,
    RegisterCallForAchievementsHandler,
    InProcessDomainEventPublisher,
    DexScreenerLiveMarketDataAdapter,
    SettingsAchievementSettingsAdapter,
    InMemoryAchievementCacheAdapter,
    RedisAchievementCacheAdapter,
    InMemoryAchievementThresholdRepository,
    InMemoryMonitoredCallRepository,
    {
      provide: AchievementEventPublisher,
      useExisting: InProcessDomainEventPublisher,
    },
    {
      provide: AchievementSettingsPort,
      useExisting: SettingsAchievementSettingsAdapter,
    },
    {
      provide: AchievementCachePort,
      useClass: RedisAchievementCacheAdapter,
    },
    {
      provide: LiveMarketDataPort,
      useExisting: DexScreenerLiveMarketDataAdapter,
    },
    {
      provide: AchievementThresholdRepository,
      useClass: TypeormAchievementThresholdRepository,
    },
    {
      provide: MonitoredCallRepository,
      useClass: TypeormMonitoredCallRepository,
    },
  ],
  exports: [
    AchievementEventPublisher,
    AchievementThresholdRepository,
    MonitoredCallRepository,
    AchievementCachePort,
    LiveMarketDataPort,
    AchievementSettingsPort,
  ],
})
export class AchievementModule implements OnApplicationBootstrap {
  constructor(private readonly seed: DefaultThresholdsSeedService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seed.onModuleInit();
  }
}
