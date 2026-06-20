import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EvaluateCallPerformanceUseCase } from 'ca/analytics/application/handlers/evaluate-call-performance.use-case';
import { RecomputeChannelStatsUseCase } from 'ca/analytics/application/handlers/recompute-channel-stats.use-case';
import {
  GetChannelReputationUseCase,
  GetTopReputedChannelsUseCase,
  ListAllChannelReputationsUseCase,
  ChannelReputationStatsView,
} from 'ca/analytics/application/handlers/channel-reputation-queries.use-case';
import { GetEvaluationJobUseCase } from 'ca/analytics/application/handlers/get-evaluation-job.use-case';
import { EnqueueEvaluationJobsUseCase } from 'ca/analytics/application/handlers/enqueue-evaluation-jobs.use-case';
import { ProcessDueEvaluationJobsUseCase } from 'ca/analytics/application/handlers/process-due-evaluation-jobs.use-case';
import { BackgroundEvaluationScheduler } from 'ca/analytics/infrastructure/scheduling/background-evaluation.scheduler';
import {
  EvaluateCallInputDto,
  GetTopChannelsQueryDto,
} from 'ca/analytics/api/input/analytics.input';
import { EnqueueJobsInputDto } from 'ca/analytics/api/input/enqueue-jobs.input';
import {
  CallEvaluationJobView,
  CallEvaluationJobMapper,
} from 'ca/analytics/application/mappers/call-evaluation-job.mapper';

@Controller('ca/analytics')
export class AnalyticsController {
  public constructor(
    private readonly evaluate: EvaluateCallPerformanceUseCase,
    private readonly recompute: RecomputeChannelStatsUseCase,
    private readonly getOne: GetChannelReputationUseCase,
    private readonly getTop: GetTopReputedChannelsUseCase,
    private readonly listAll: ListAllChannelReputationsUseCase,
    private readonly getJobUseCase: GetEvaluationJobUseCase,
    private readonly enqueueJobs: EnqueueEvaluationJobsUseCase,
    private readonly processDue: ProcessDueEvaluationJobsUseCase,
    private readonly scheduler: BackgroundEvaluationScheduler,
  ) {}

  @Post('evaluate')
  public evaluateCall(
    @Body() input: EvaluateCallInputDto,
  ): Promise<ChannelReputationStatsView> {
    return this.evaluate
      .execute({
        channelId: input.channelId,
        chain: input.chain,
        address: input.address,
        mcAtCall: input.mcAtCall ?? null,
        callTimestamp: input.callTimestamp,
      })
      .then((stats) => this.getOne.execute(stats.channelId));
  }

  @Post('recompute/:channelId')
  public recomputeChannel(
    @Param('channelId') channelId: string,
  ): Promise<ChannelReputationStatsView> {
    return this.recompute
      .execute({ channelId })
      .then((stats) => this.getOne.execute(stats.channelId));
  }

  @Get('channels/top')
  public topChannels(
    @Query() query: GetTopChannelsQueryDto,
  ): Promise<ReadonlyArray<ChannelReputationStatsView>> {
    return this.getTop.execute(query.limit ?? 20, query.minConfidence);
  }

  @Get('channels')
  public listAllChannels(): Promise<ReadonlyArray<ChannelReputationStatsView>> {
    return this.listAll.execute();
  }

  @Get('channels/:channelId')
  public getChannel(
    @Param('channelId') channelId: string,
  ): Promise<ChannelReputationStatsView> {
    return this.getOne.execute(channelId);
  }

  @Post('jobs/enqueue')
  public async enqueueJob(
    @Body() input: EnqueueJobsInputDto,
  ): Promise<ReadonlyArray<CallEvaluationJobView>> {
    const jobs = await this.enqueueJobs.execute({
      channelId: input.channelId,
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

  @Post('evaluate-due')
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
