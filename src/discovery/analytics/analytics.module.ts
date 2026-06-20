import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { PerformanceEvaluatorPort } from 'discovery/analytics/domain/ports/performance-evaluator.port';
import { ChannelReputationStatsRepository } from 'discovery/analytics/application/ports/channel-reputation-stats.repository';
import { CallPerformanceRepository } from 'discovery/analytics/application/ports/call-performance.repository';
import { CallEvaluationJobRepository } from 'discovery/analytics/application/ports/call-evaluation-job.repository';
import { EvaluateCallPerformanceUseCase } from 'discovery/analytics/application/handlers/evaluate-call-performance.use-case';
import { RecomputeChannelStatsUseCase } from 'discovery/analytics/application/handlers/recompute-channel-stats.use-case';
import {
  GetChannelReputationUseCase,
  GetTopReputedChannelsUseCase,
  ListAllChannelReputationsUseCase,
} from 'discovery/analytics/application/handlers/channel-reputation-queries.use-case';
import { EnqueueEvaluationJobsUseCase } from 'discovery/analytics/application/handlers/enqueue-evaluation-jobs.use-case';
import { ProcessDueEvaluationJobsUseCase } from 'discovery/analytics/application/handlers/process-due-evaluation-jobs.use-case';
import { GetEvaluationJobUseCase } from 'discovery/analytics/application/handlers/get-evaluation-job.use-case';
import { DexScreenerPerformanceEvaluatorAdapter } from 'discovery/analytics/infrastructure/adapters/dexscreener-performance-evaluator.adapter';
import { InMemoryChannelReputationStatsRepository } from 'discovery/analytics/infrastructure/repositories/in-memory-channel-reputation-stats.repository';
import { TypeOrmChannelReputationStatsRepository } from 'discovery/analytics/infrastructure/persistence/typeorm/repositories/typeorm-channel-reputation-stats.repository';
import { ChannelReputationStatsEntity } from 'discovery/analytics/infrastructure/persistence/typeorm/entities/channel-reputation-stats.entity';
import { InMemoryCallPerformanceRepository } from 'discovery/analytics/infrastructure/repositories/in-memory-call-performance.repository';
import { InMemoryCallEvaluationJobRepository } from 'discovery/analytics/infrastructure/repositories/in-memory-call-evaluation-job.repository';
import { BackgroundEvaluationScheduler } from 'discovery/analytics/infrastructure/scheduling/background-evaluation.scheduler';
import { TokenScoredHandler } from 'discovery/analytics/infrastructure/event-bus/token-scored.handler';
import { AnalyticsController } from 'discovery/analytics/api/http/analytics.controller';
import type { AppConfig } from 'shared/common/config/app.config';

@Module({
  imports: [
    ConfigModule,
    ...(isDatabaseEnabled()
      ? [TypeOrmModule.forFeature([ChannelReputationStatsEntity])]
      : []),
  ],
  controllers: [AnalyticsController],
  providers: [
    EvaluateCallPerformanceUseCase,
    RecomputeChannelStatsUseCase,
    GetChannelReputationUseCase,
    GetTopReputedChannelsUseCase,
    ListAllChannelReputationsUseCase,
    EnqueueEvaluationJobsUseCase,
    ProcessDueEvaluationJobsUseCase,
    GetEvaluationJobUseCase,
    BackgroundEvaluationScheduler,
    TokenScoredHandler,
    InMemoryChannelReputationStatsRepository,
    ...(isDatabaseEnabled() ? [TypeOrmChannelReputationStatsRepository] : []),
    {
      provide: ChannelReputationStatsRepository,
      inject: [
        ConfigService,
        InMemoryChannelReputationStatsRepository,
        ...(isDatabaseEnabled()
          ? [TypeOrmChannelReputationStatsRepository]
          : []),
      ],
      useFactory: (
        config: ConfigService,
        inMemory: InMemoryChannelReputationStatsRepository,
        typeorm?: TypeOrmChannelReputationStatsRepository,
      ): ChannelReputationStatsRepository => {
        const enabled =
          config.get<AppConfig>('app')?.database?.enabled === true;
        return enabled && typeorm ? typeorm : inMemory;
      },
    },
    {
      provide: CallPerformanceRepository,
      useClass: InMemoryCallPerformanceRepository,
    },
    {
      provide: CallEvaluationJobRepository,
      useClass: InMemoryCallEvaluationJobRepository,
    },
    {
      provide: PerformanceEvaluatorPort,
      useClass: DexScreenerPerformanceEvaluatorAdapter,
    },
  ],
  exports: [
    ChannelReputationStatsRepository,
    CallPerformanceRepository,
    CallEvaluationJobRepository,
  ],
})
export class AnalyticsModule {}
