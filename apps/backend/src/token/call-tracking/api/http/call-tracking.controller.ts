import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { EvaluateCallPerformanceUseCase } from 'token/call-tracking/application/handlers/evaluate-call-performance.use-case';
import { EnqueueEvaluationJobsUseCase } from 'token/call-tracking/application/handlers/enqueue-evaluation-jobs.use-case';
import { GetEvaluationJobUseCase } from 'token/call-tracking/application/handlers/get-evaluation-job.use-case';
import { ProcessDueEvaluationJobsUseCase } from 'token/call-tracking/application/handlers/process-due-evaluation-jobs.use-case';
import { BackgroundEvaluationScheduler } from 'token/call-tracking/infrastructure/scheduling/background-evaluation.scheduler';
import { EvaluateCallInputDto } from 'token/call-tracking/api/input/analytics.input';
import { EnqueueJobsInputDto } from 'token/call-tracking/api/input/enqueue-jobs.input';
import {
  CallEvaluationJobView,
  CallEvaluationJobMapper,
} from 'token/call-tracking/application/mappers/call-evaluation-job.mapper';

@Controller('token/call-tracking')
export class CallTrackingController {
  public constructor(
    private readonly evaluate: EvaluateCallPerformanceUseCase,
    private readonly getJobUseCase: GetEvaluationJobUseCase,
    private readonly enqueueJobs: EnqueueEvaluationJobsUseCase,
    private readonly processDue: ProcessDueEvaluationJobsUseCase,
    private readonly scheduler: BackgroundEvaluationScheduler,
  ) {}

  @Post('calls/evaluate')
  public evaluateCall(
    @Body() input: EvaluateCallInputDto,
  ): Promise<{ ok: true }> {
    return this.evaluate
      .execute({
        kolId: input.kolId,
        chain: input.chain,
        address: input.address,
        mcAtCall: input.mcAtCall ?? null,
        callTimestamp: input.callTimestamp,
      })
      .then(() => ({ ok: true as const }));
  }

  @Post('jobs/enqueue')
  public async enqueueJob(
    @Body() input: EnqueueJobsInputDto,
  ): Promise<ReadonlyArray<CallEvaluationJobView>> {
    const jobs = await this.enqueueJobs.execute({
      kolId: input.kolId,
      chain: input.chain,
      address: input.address,
      callTimestamp: new Date(input.callTimestamp),
      mcAtCall: input.mcAtCall ?? null,
    });
    return jobs.map((j) => CallEvaluationJobMapper.toView(j));
  }

  @Get('jobs/:id')
  public getJob(@Param('id') id: string): Promise<CallEvaluationJobView> {
    return this.getJobUseCase.execute(id);
  }

  @Post('jobs/evaluate-due')
  public async evaluateDue(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  }> {
    return this.processDue.execute(50);
  }

  @Post('scheduler/tick')
  public async tickScheduler(): Promise<{ ok: true }> {
    await this.scheduler.tick();
    return { ok: true };
  }
}
