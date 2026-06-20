import { ChannelReputationStatsRepository } from 'discovery/analytics/application/ports/channel-reputation-stats.repository';
import {
  ChannelReputationStats,
  ConfidenceLevel,
} from 'discovery/analytics/domain/value-objects/channel-reputation-stats.vo';

export interface ChannelReputationStatsView {
  readonly channelId: string;
  readonly score: number;
  readonly totalCalls: number;
  readonly strongCalls: number;
  readonly goodCalls: number;
  readonly neutralCalls: number;
  readonly poorCalls: number;
  readonly failedCalls: number;
  readonly successRate: number;
  readonly failureRate: number;
  readonly avgAthMultiple: number | null;
  readonly confidence: string;
  readonly isTrusted: boolean;
  readonly isSuspicious: boolean;
  readonly lastEvaluatedAt: string;
}

export class ChannelReputationStatsMapper {
  public static toView(
    stats: ChannelReputationStats,
  ): ChannelReputationStatsView {
    return {
      channelId: stats.channelId,
      score: stats.score,
      totalCalls: stats.totalCalls,
      strongCalls: stats.strongCalls,
      goodCalls: stats.goodCalls,
      neutralCalls: stats.neutralCalls,
      poorCalls: stats.poorCalls,
      failedCalls: stats.failedCalls,
      successRate: Math.round(stats.successRate() * 100) / 100,
      failureRate: Math.round(stats.failureRate() * 100) / 100,
      avgAthMultiple: stats.avgAthMultiple,
      confidence: stats.confidence,
      isTrusted: stats.isTrusted,
      isSuspicious: stats.isSuspicious,
      lastEvaluatedAt: stats.lastEvaluatedAt.toISOString(),
    };
  }
}

export class GetChannelReputationUseCase {
  public constructor(
    private readonly statsRepo: ChannelReputationStatsRepository,
  ) {}

  public async execute(channelId: string): Promise<ChannelReputationStatsView> {
    const stats = await this.statsRepo.findByChannel(channelId);
    return ChannelReputationStatsMapper.toView(
      stats ?? ChannelReputationStats.empty(channelId),
    );
  }
}

export class GetTopReputedChannelsUseCase {
  public constructor(
    private readonly statsRepo: ChannelReputationStatsRepository,
  ) {}

  public async execute(
    limit: number,
    minConfidence?: ConfidenceLevel,
  ): Promise<ReadonlyArray<ChannelReputationStatsView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new Error(`Invalid limit: ${limit}`);
    }
    const stats = await this.statsRepo.findTop(limit, minConfidence);
    return stats.map((s) => ChannelReputationStatsMapper.toView(s));
  }
}

export class ListAllChannelReputationsUseCase {
  public constructor(
    private readonly statsRepo: ChannelReputationStatsRepository,
  ) {}

  public async execute(): Promise<ReadonlyArray<ChannelReputationStatsView>> {
    const stats = await this.statsRepo.findAll();
    return stats.map((s) => ChannelReputationStatsMapper.toView(s));
  }
}
