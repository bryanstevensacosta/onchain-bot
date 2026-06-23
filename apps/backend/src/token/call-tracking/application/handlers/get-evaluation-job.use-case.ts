import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { CallEvaluationJobRepository } from 'token/call-tracking/application/ports/call-evaluation-job.repository';
import {
  CallEvaluationJobMapper,
  CallEvaluationJobView,
} from 'token/call-tracking/application/mappers/call-evaluation-job.mapper';

@Injectable()
export class GetEvaluationJobUseCase {
  public constructor(private readonly jobRepo: CallEvaluationJobRepository) {}

  public async execute(id: string): Promise<CallEvaluationJobView> {
    const job = await this.jobRepo.findById(id);
    if (!job) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Evaluation job not found: ${id}`,
        { id },
      );
    }
    return CallEvaluationJobMapper.toView(job);
  }
}
