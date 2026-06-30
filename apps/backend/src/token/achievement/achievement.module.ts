import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { EnrichmentModule } from 'token/enrichment/enrichment.module';
import { AchievementThresholdEntity } from './domain/entities/achievement-threshold.entity';
import { MonitoredCallEntity } from './domain/entities/monitored-call.entity';
import { NotifiedAchievementEntity } from './domain/entities/notified-achievement.entity';
import { DetectCrossedAchievementsService } from './application/services/detect-crossed-achievements.service';
import { RecordNotifiedAchievementUseCase } from './application/handlers/record-notified-achievement.use-case';
import { RegisterMonitoredCallUseCase } from './application/handlers/register-monitored-call.use-case';
import { EvaluateActiveCallsUseCase } from './application/handlers/evaluate-active-calls.use-case';
import { TypeormAchievementThresholdRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-achievement-threshold.repository';
import { TypeormMonitoredCallRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-monitored-call.repository';
import { TypeormNotifiedAchievementRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-notified-achievement.repository';
import { InMemoryAchievementThresholdRepository } from './infrastructure/repositories/in-memory-achievement-threshold.repository';
import { InMemoryMonitoredCallRepository } from './infrastructure/repositories/in-memory-monitored-call.repository';
import { InMemoryNotifiedAchievementRepository } from './infrastructure/repositories/in-memory-notified-achievement.repository';
import { DexScreenerLiveMarketDataAdapter } from './infrastructure/adapters/dexscreener-live-market-data.adapter';
import { RedisAchievementCacheAdapter } from './infrastructure/adapters/redis-achievement-cache.adapter';
import { InMemoryAchievementCacheAdapter } from './infrastructure/adapters/in-memory-achievement-cache.adapter';
import { SettingsAchievementSettingsAdapter } from './infrastructure/adapters/settings-achievement-settings.adapter';
import { InProcessAchievementEventPublisher } from './infrastructure/messaging/in-process-achievement-event.publisher';
import { RegisterCallForAchievementsHandler } from './infrastructure/event-bus/register-call-for-achievements.handler';
import { DefaultThresholdsSeedService } from './infrastructure/default-thresholds-seed.service';
import { LiveAchievementScheduler } from './infrastructure/scheduling/live-achievement.scheduler';
import { AchievementController } from './api/http/achievement.controller';
import {
  AchievementCachePort,
  AchievementEventPublisher,
  AchievementSettingsPort,
  AchievementThresholdRepository,
  MonitoredCallRepository,
  NotifiedAchievementRepository,
  LiveMarketDataPort,
} from './application/ports/index-export';

const PERSISTED_ENTITIES = [
  AchievementThresholdEntity,
  MonitoredCallEntity,
  NotifiedAchievementEntity,
];

@Module({
  imports: [
    EnrichmentModule,
    TypeOrmModule.forFeature(PERSISTED_ENTITIES),
  ],
  controllers: [AchievementController],
  providers: [
    DetectCrossedAchievementsService,
    RecordNotifiedAchievementUseCase,
    RegisterMonitoredCallUseCase,
    EvaluateActiveCallsUseCase,
    DefaultThresholdsSeedService,
    LiveAchievementScheduler,
    RegisterCallForAchievementsHandler,
    InProcessAchievementEventPublisher,
    DexScreenerLiveMarketDataAdapter,
    SettingsAchievementSettingsAdapter,
    InMemoryAchievementCacheAdapter,
    RedisAchievementCacheAdapter,
    InMemoryAchievementThresholdRepository,
    InMemoryMonitoredCallRepository,
    InMemoryNotifiedAchievementRepository,
    {
      provide: AchievementEventPublisher,
      useExisting: InProcessAchievementEventPublisher,
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
    {
      provide: NotifiedAchievementRepository,
      useClass: TypeormNotifiedAchievementRepository,
    },
  ],
  exports: [
    AchievementEventPublisher,
    AchievementThresholdRepository,
    MonitoredCallRepository,
    NotifiedAchievementRepository,
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
