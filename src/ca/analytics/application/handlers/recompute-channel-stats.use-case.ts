import { ChannelReputationStatsRepository } from 'ca/analytics/application/ports/channel-reputation-stats.repository';
import { ChannelReputationStats } from 'ca/analytics/domain/value-objects/channel-reputation-stats.vo';
import { recomputeStats } from 'ca/analytics/application/handlers/evaluate-call-performance.use-case';
import { CallPerformanceRepository } from 'ca/analytics/application/ports/call-performance.repository';

export interface RecomputeChannelStatsInput {
  readonly channelId: string;
}

/**
 * Use case: recompute reputation stats for a channel from existing
 * stored performances (no fresh evaluation).
 *
 * Useful for: forced refresh, fixing drift after bulk evaluation jobs.
 */
export class RecomputeChannelStatsUseCase {
  public constructor(
    private readonly performanceRepo: CallPerformanceRepository,
    private readonly statsRepo: ChannelReputationStatsRepository,
  ) {}

  public async execute(
    input: RecomputeChannelStatsInput,
  ): Promise<ChannelReputationStats> {
    const perfs = await this.performanceRepo.findByChannel(input.channelId);
    const stats = recomputeStats(input.channelId, perfs);
    await this.statsRepo.save(stats);
    return stats;
  }
}
