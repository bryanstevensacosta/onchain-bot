import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { EvaluationHorizonVo } from 'ca/analytics/domain/value-objects/evaluation-horizon.vo';
import { CallEvaluationJob } from 'ca/analytics/domain/entities/call-evaluation-job.entity';
import { CallEvaluationJobRepository } from 'ca/analytics/application/ports/call-evaluation-job.repository';

export interface EnqueueEvaluationJobsInput {
  readonly channelId: string;
  readonly chain: string;
  readonly address: string;
  readonly callTimestamp: Date;
  readonly mcAtCall: number | null;
  readonly horizons?: ReadonlyArray<EvaluationHorizonVo>;
}

/**
 * Use case: enqueue one or more CallEvaluationJobs for a given call.
 *
 * Idempotent: re-enqueueing the same call+horizon combination returns
 * the existing job without creating a duplicate (composite id).
 */
@Injectable()
export class EnqueueEvaluationJobsUseCase {
  private readonly logger = new Logger(EnqueueEvaluationJobsUseCase.name);

  public constructor(private readonly jobRepo: CallEvaluationJobRepository) {}

  public async execute(
    input: EnqueueEvaluationJobsInput,
  ): Promise<ReadonlyArray<CallEvaluationJob>> {
    const chain = ChainId.fromString(input.chain);
    const horizons = input.horizons ?? EvaluationHorizonVo.defaultHorizons();
    const enqueued: CallEvaluationJob[] = [];

    for (const horizon of horizons) {
      const existing = await this.jobRepo.findPendingForCall(
        input.channelId,
        chain.value,
        input.address,
        input.callTimestamp,
      );
      const alreadyExists = existing.some(
        (j) => j.horizon.value === horizon.value,
      );
      if (alreadyExists) {
        this.logger.debug(
          `Job already exists: ${input.channelId}:${chain.value}:${input.address}:${horizon.value}`,
        );
        continue;
      }
      const job = CallEvaluationJob.enqueue({
        channelId: input.channelId,
        chain,
        address: input.address,
        horizon,
        callTimestamp: input.callTimestamp,
        mcAtCall: input.mcAtCall,
      });
      await this.jobRepo.save(job);
      enqueued.push(job);
    }

    this.logger.log(
      `Enqueued ${enqueued.length} job(s) for ${input.channelId}:${chain.value}:${input.address}`,
    );
    return enqueued;
  }
}
