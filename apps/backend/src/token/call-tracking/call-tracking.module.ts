import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { AchievementModule } from 'token/achievement/achievement.module';
import { SettingsModule } from 'settings/settings.module';
import { VipCallsModule } from 'telegram/vip-calls-channel/vip-calls.module';
import { ReputationModule } from 'kol/reputation/reputation.module';
import { CallEvaluationJobRepository } from 'token/call-tracking/application/ports/call-evaluation-job.repository';
import { CallPerformanceRepository } from 'token/call-tracking/application/ports/call-performance.repository';
import { CallOutcomeEvaluatorPort } from 'token/call-tracking/domain/ports/call-outcome-evaluator.port';
import { EnqueueEvaluationJobsUseCase } from 'token/call-tracking/application/handlers/enqueue-evaluation-jobs.use-case';
import { EvaluateCallPerformanceUseCase } from 'token/call-tracking/application/handlers/evaluate-call-performance.use-case';
import { GetEvaluationJobUseCase } from 'token/call-tracking/application/handlers/get-evaluation-job.use-case';
import { ProcessDueEvaluationJobsUseCase } from 'token/call-tracking/application/handlers/process-due-evaluation-jobs.use-case';
import { InMemoryCallEvaluationJobRepository } from 'token/call-tracking/infrastructure/repositories/in-memory-call-evaluation-job.repository';
import { InMemoryCallPerformanceRepository } from 'token/call-tracking/infrastructure/repositories/in-memory-call-performance.repository';
import { CallPerformanceEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/call-performance.entity';
import { CallEvaluationJobEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/call-evaluation-job.entity';
import { TypeOrmCallPerformanceRepository } from 'token/call-tracking/infrastructure/persistence/typeorm/repositories/typeorm-call-performance.repository';
import { TypeOrmCallEvaluationJobRepository } from 'token/call-tracking/infrastructure/persistence/typeorm/repositories/typeorm-call-evaluation-job.repository';
import { DexScreenerCallOutcomeEvaluatorAdapter } from 'token/call-tracking/infrastructure/adapters/dexscreener-call-outcome-evaluator.adapter';
import { BackgroundEvaluationScheduler } from 'token/call-tracking/infrastructure/scheduling/background-evaluation.scheduler';
import { CallTrackingController } from 'token/call-tracking/api/http/call-tracking.controller';
import { TrackedPublishedCallRepository } from 'token/call-tracking/application/ports/tracked-published-call.repository';
import { TrackPublishedCallUseCase } from 'token/call-tracking/application/handlers/track-published-call.use-case';
import { ListTrackedCallsUseCase } from 'token/call-tracking/application/handlers/list-tracked-calls.use-case';
import { GetTrackedCallUseCase } from 'token/call-tracking/application/handlers/get-tracked-call.use-case';
import { CanRepublishTokenUseCase } from 'token/call-tracking/application/handlers/can-republish-token.use-case';
import { UpdateTrackedCallsUseCase } from 'token/call-tracking/application/handlers/update-tracked-calls.use-case';
import { InMemoryTrackedPublishedCallRepository } from 'token/call-tracking/infrastructure/repositories/in-memory-tracked-published-call.repository';
import { TrackedPublishedCallOrmEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/tracked-published-call.entity';
import { TypeOrmTrackedPublishedCallRepository } from 'token/call-tracking/infrastructure/persistence/typeorm/repositories/typeorm-tracked-published-call.repository';
import { TrackingCronScheduler } from 'token/call-tracking/infrastructure/scheduling/tracking-cron.scheduler';
import { CallPublishedTrackedHandler } from 'token/call-tracking/infrastructure/event-bus/call-published-tracked.handler';
import { DefaultTrackingFilterSeedService } from 'token/call-tracking/infrastructure/default-tracking-filter-seed.service';
import { TrackedCallsController } from 'token/call-tracking/api/http/tracked-calls.controller';

/**
 * Call Tracking BC module.
 *
 * Two responsibilities:
 * 1. Evaluates whether published token calls turned out well
 *    (STRONG/GOOD/NEUTRAL/POOR/FAILED) via `CallPerformance` + `CallEvaluationJob`.
 * 2. Tracks published calls for milestone detection: creates
 *    `TrackedPublishedCall` on `publishing.telegram.published`,
 *    updates `mcNow` + `milestonesHit` via the tracking cron,
 *    and exposes the tracked-calls API + gate-allow check.
 *
 * Inputs: `TokenScoredEvent` (enqueue), `CallPublishedEvent` (track).
 * Outputs: `CallPerformance`, `CallEvaluationJob`, `TrackedPublishedCall`,
 *          `achievement.call.reached` (via AchievementModule).
 *
 * Extracted from `token/analytics/` (N3 in name-refactor.md).
 * N18: persisted via TypeORM (Tier-2).
 */
@Module({
  imports: [
    AchievementModule,
    SettingsModule,
    VipCallsModule,
    forwardRef(() => ReputationModule),
    ...(isDatabaseEnabled()
      ? [
          TypeOrmModule.forFeature([
            CallPerformanceEntity,
            CallEvaluationJobEntity,
            TrackedPublishedCallOrmEntity,
          ]),
        ]
      : []),
  ],
  controllers: [CallTrackingController, TrackedCallsController],
  providers: [
    InMemoryCallEvaluationJobRepository,
    InMemoryCallPerformanceRepository,
    InMemoryTrackedPublishedCallRepository,
    ...(isDatabaseEnabled()
      ? [
          TypeOrmCallEvaluationJobRepository,
          TypeOrmCallPerformanceRepository,
          TypeOrmTrackedPublishedCallRepository,
        ]
      : []),
    {
      provide: CallEvaluationJobRepository,
      inject: [
        InMemoryCallEvaluationJobRepository,
        ...(isDatabaseEnabled() ? [TypeOrmCallEvaluationJobRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryCallEvaluationJobRepository,
        typeorm?: TypeOrmCallEvaluationJobRepository,
      ): CallEvaluationJobRepository => typeorm ?? inMemory,
    },
    {
      provide: CallPerformanceRepository,
      inject: [
        InMemoryCallPerformanceRepository,
        ...(isDatabaseEnabled() ? [TypeOrmCallPerformanceRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryCallPerformanceRepository,
        typeorm?: TypeOrmCallPerformanceRepository,
      ): CallPerformanceRepository => typeorm ?? inMemory,
    },
    {
      provide: TrackedPublishedCallRepository,
      inject: [
        InMemoryTrackedPublishedCallRepository,
        ...(isDatabaseEnabled() ? [TypeOrmTrackedPublishedCallRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryTrackedPublishedCallRepository,
        typeorm?: TypeOrmTrackedPublishedCallRepository,
      ): TrackedPublishedCallRepository => typeorm ?? inMemory,
    },
    {
      provide: CallOutcomeEvaluatorPort,
      useClass: DexScreenerCallOutcomeEvaluatorAdapter,
    },
    EnqueueEvaluationJobsUseCase,
    EvaluateCallPerformanceUseCase,
    GetEvaluationJobUseCase,
    ProcessDueEvaluationJobsUseCase,
    BackgroundEvaluationScheduler,
    TrackPublishedCallUseCase,
    ListTrackedCallsUseCase,
    GetTrackedCallUseCase,
    CanRepublishTokenUseCase,
    UpdateTrackedCallsUseCase,
    TrackingCronScheduler,
    CallPublishedTrackedHandler,
    DefaultTrackingFilterSeedService,
  ],
  exports: [
    CallEvaluationJobRepository,
    CallPerformanceRepository,
    CallOutcomeEvaluatorPort,
    TrackedPublishedCallRepository,
  ],
})
export class CallTrackingModule {}
