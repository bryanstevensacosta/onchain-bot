import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
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

/**
 * Call Tracking BC module.
 *
 * Evaluates whether published token calls turned out well (STRONG/GOOD/NEUTRAL/POOR/FAILED).
 *
 * Inputs: `TokenScoredEvent` (from `token/scoring/`) triggers job enqueue.
 * Outputs: `CallPerformance` records, `CallEvaluationJob` jobs.
 *
 * Extracted from `token/analytics/` (N3 in name-refactor.md).
 *
 * N18: CallPerformance + CallEvaluationJob persisted via TypeORM (Tier-2).
 */
@Module({
  imports: [
    ...(isDatabaseEnabled()
      ? [
          TypeOrmModule.forFeature([
            CallPerformanceEntity,
            CallEvaluationJobEntity,
          ]),
        ]
      : []),
  ],
  controllers: [CallTrackingController],
  providers: [
    InMemoryCallEvaluationJobRepository,
    InMemoryCallPerformanceRepository,
    ...(isDatabaseEnabled()
      ? [TypeOrmCallEvaluationJobRepository, TypeOrmCallPerformanceRepository]
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
      provide: CallOutcomeEvaluatorPort,
      useClass: DexScreenerCallOutcomeEvaluatorAdapter,
    },
    EnqueueEvaluationJobsUseCase,
    EvaluateCallPerformanceUseCase,
    GetEvaluationJobUseCase,
    ProcessDueEvaluationJobsUseCase,
    BackgroundEvaluationScheduler,
  ],
  exports: [
    CallEvaluationJobRepository,
    CallPerformanceRepository,
    CallOutcomeEvaluatorPort,
  ],
})
export class CallTrackingModule {}
