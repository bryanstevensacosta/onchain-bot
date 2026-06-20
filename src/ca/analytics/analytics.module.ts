import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { PerformanceEvaluatorPort } from 'ca/analytics/domain/ports/performance-evaluator.port';
import { ChannelReputationStatsRepository } from 'ca/analytics/application/ports/channel-reputation-stats.repository';
import { CallPerformanceRepository } from 'ca/analytics/application/ports/call-performance.repository';
import { CallEvaluationJobRepository } from 'ca/analytics/application/ports/call-evaluation-job.repository';
import { EvaluateCallPerformanceUseCase } from 'ca/analytics/application/handlers/evaluate-call-performance.use-case';
import { RecomputeChannelStatsUseCase } from 'ca/analytics/application/handlers/recompute-channel-stats.use-case';
import {
  GetChannelReputationUseCase,
  GetTopReputedChannelsUseCase,
  ListAllChannelReputationsUseCase,
} from 'ca/analytics/application/handlers/channel-reputation-queries.use-case';
import { EnqueueEvaluationJobsUseCase } from 'ca/analytics/application/handlers/enqueue-evaluation-jobs.use-case';
import { ProcessDueEvaluationJobsUseCase } from 'ca/analytics/application/handlers/process-due-evaluation-jobs.use-case';
import { GetEvaluationJobUseCase } from 'ca/analytics/application/handlers/get-evaluation-job.use-case';
import { DexScreenerPerformanceEvaluatorAdapter } from 'ca/analytics/infrastructure/adapters/dexscreener-performance-evaluator.adapter';
import { InMemoryChannelReputationStatsRepository } from 'ca/analytics/infrastructure/repositories/in-memory-channel-reputation-stats.repository';
import { TypeOrmChannelReputationStatsRepository } from 'ca/analytics/infrastructure/persistence/typeorm/repositories/typeorm-channel-reputation-stats.repository';
import { ChannelReputationStatsEntity } from 'ca/analytics/infrastructure/persistence/typeorm/entities/channel-reputation-stats.entity';
import { InMemoryCallPerformanceRepository } from 'ca/analytics/infrastructure/repositories/in-memory-call-performance.repository';
import { InMemoryCallEvaluationJobRepository } from 'ca/analytics/infrastructure/repositories/in-memory-call-evaluation-job.repository';
import { BackgroundEvaluationScheduler } from 'ca/analytics/infrastructure/scheduling/background-evaluation.scheduler';
import { TokenScoredHandler } from 'ca/analytics/infrastructure/event-bus/token-scored.handler';
import { AnalyticsController } from 'ca/analytics/api/http/analytics.controller';
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
