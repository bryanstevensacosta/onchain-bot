import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { MilestoneThresholdEntity } from './domain/entities/milestone-threshold.entity';
import { MonitoredCallEntity } from './domain/entities/monitored-call.entity';
import { NotifiedMilestoneEntity } from './domain/entities/notified-milestone.entity';
import { DetectCrossedMilestonesService } from './application/services/detect-crossed-milestones.service';
import { RecordNotifiedMilestoneUseCase } from './application/handlers/record-notified-milestone.use-case';
import { RegisterMonitoredCallUseCase } from './application/handlers/register-monitored-call.use-case';
import { EvaluateActiveCallsUseCase } from './application/handlers/evaluate-active-calls.use-case';
import { TypeormMilestoneThresholdRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-milestone-threshold.repository';
import { TypeormMonitoredCallRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-monitored-call.repository';
import { TypeormNotifiedMilestoneRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-notified-milestone.repository';
import { InMemoryMilestoneThresholdRepository } from './infrastructure/repositories/in-memory-milestone-threshold.repository';
import { InMemoryMonitoredCallRepository } from './infrastructure/repositories/in-memory-monitored-call.repository';
import { InMemoryNotifiedMilestoneRepository } from './infrastructure/repositories/in-memory-notified-milestone.repository';
import { DexScreenerLiveMarketDataAdapter } from './infrastructure/adapters/dexscreener-live-market-data.adapter';
import { RedisMilestoneCacheAdapter } from './infrastructure/adapters/redis-milestone-cache.adapter';
import { InMemoryMilestoneCacheAdapter } from './infrastructure/adapters/in-memory-milestone-cache.adapter';
import { SettingsMilestoneSettingsAdapter } from './infrastructure/adapters/settings-milestone-settings.adapter';
import { InProcessMilestoneEventPublisher } from './infrastructure/messaging/in-process-milestone-event.publisher';
import { RegisterCallForMilestonesHandler } from './infrastructure/event-bus/register-call-for-milestones.handler';
import { DefaultThresholdsSeedService } from './infrastructure/default-thresholds-seed.service';
import { LiveMilestoneScheduler } from './infrastructure/scheduling/live-milestone.scheduler';
import { MilestoneController } from './api/http/milestone.controller';
import {
  MilestoneCachePort,
  MilestoneEventPublisher,
  MilestoneSettingsPort,
  MilestoneThresholdRepository,
  MonitoredCallRepository,
  NotifiedMilestoneRepository,
  LiveMarketDataPort,
} from './application/ports/index-export';

const PERSISTED_ENTITIES = [
  MilestoneThresholdEntity,
  MonitoredCallEntity,
  NotifiedMilestoneEntity,
];

@Module({
  imports: isDatabaseEnabled()
    ? [TypeOrmModule.forFeature(PERSISTED_ENTITIES)]
    : [],
  controllers: [MilestoneController],
  providers: [
    DetectCrossedMilestonesService,
    RecordNotifiedMilestoneUseCase,
    RegisterMonitoredCallUseCase,
    EvaluateActiveCallsUseCase,
    DefaultThresholdsSeedService,
    LiveMilestoneScheduler,
    RegisterCallForMilestonesHandler,
    InProcessMilestoneEventPublisher,
    DexScreenerLiveMarketDataAdapter,
    SettingsMilestoneSettingsAdapter,
    InMemoryMilestoneCacheAdapter,
    RedisMilestoneCacheAdapter,
    InMemoryMilestoneThresholdRepository,
    InMemoryMonitoredCallRepository,
    InMemoryNotifiedMilestoneRepository,
    {
      provide: MilestoneEventPublisher,
      useExisting: InProcessMilestoneEventPublisher,
    },
    {
      provide: MilestoneSettingsPort,
      useExisting: SettingsMilestoneSettingsAdapter,
    },
    {
      provide: MilestoneCachePort,
      useClass: RedisMilestoneCacheAdapter,
    },
    {
      provide: LiveMarketDataPort,
      useExisting: DexScreenerLiveMarketDataAdapter,
    },
    {
      provide: MilestoneThresholdRepository,
      useClass: TypeormMilestoneThresholdRepository,
    },
    {
      provide: MonitoredCallRepository,
      useClass: TypeormMonitoredCallRepository,
    },
    {
      provide: NotifiedMilestoneRepository,
      useClass: TypeormNotifiedMilestoneRepository,
    },
  ],
  exports: [
    MilestoneEventPublisher,
    MilestoneThresholdRepository,
    MonitoredCallRepository,
    NotifiedMilestoneRepository,
    MilestoneCachePort,
    LiveMarketDataPort,
    MilestoneSettingsPort,
  ],
})
export class MilestoneModule implements OnApplicationBootstrap {
  constructor(private readonly seed: DefaultThresholdsSeedService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seed.onModuleInit();
  }
}
