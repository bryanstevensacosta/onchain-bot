import { Injectable, Logger } from '@nestjs/common';
import { CallEvaluationJobRepository } from 'token/call-tracking/application/ports/call-evaluation-job.repository';
import { EvaluateCallPerformanceUseCase } from 'token/call-tracking/application/handlers/evaluate-call-performance.use-case';

export interface ProcessDueJobsResult {
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly skipped: number;
}

/**
 * Use case: pick due PENDING jobs and evaluate them one at a time.
 *
 * Per-job lifecycle:
 *   1. findDue(now, limit) — fetch PENDING jobs whose scheduledAt ≤ now
 *   2. For each job: markInProgress → evaluate → markCompleted/Failed → save
 *
 * Jobs that fail evaluation are marked FAILED with the error message
 * stored for ops debugging. They are NOT retried automatically.
 */
@Injectable()
export class ProcessDueEvaluationJobsUseCase {
  private readonly logger = new Logger(ProcessDueEvaluationJobsUseCase.name);

  public constructor(
    private readonly jobRepo: CallEvaluationJobRepository,
    private readonly evaluate: EvaluateCallPerformanceUseCase,
  ) {}

  public async execute(batchSize: number = 50): Promise<ProcessDueJobsResult> {
    const now = new Date();
    const dueJobs = await this.jobRepo.findDue(now, batchSize);

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const job of dueJobs) {
      try {
        job.markInProgress();
        await this.jobRepo.save(job);

        await this.evaluate.execute({
          kolId: job.kolId,
          chain: job.chain.value,
          address: job.address,
          mcAtCall: job.mcAtCall,
          callTimestamp: job.callTimestamp,
        });

        job.markCompleted();
        await this.jobRepo.save(job);
        succeeded++;
      } catch (err) {
        const message = (err as Error).message;
        this.logger.error(
          `Job ${job.id} (${job.horizon.value}) failed: ${message}`,
        );
        try {
          job.markFailed(message);
          await this.jobRepo.save(job);
        } catch (saveErr) {
          this.logger.error(
            `Could not mark job failed: ${(saveErr as Error).message}`,
          );
          skipped++;
          continue;
        }
        failed++;
      }
    }

    this.logger.log(
      `Processed ${dueJobs.length} due job(s): ${succeeded} succeeded, ${failed} failed, ${skipped} skipped`,
    );
    return {
      processed: dueJobs.length,
      succeeded,
      failed,
      skipped,
    };
  }
}
