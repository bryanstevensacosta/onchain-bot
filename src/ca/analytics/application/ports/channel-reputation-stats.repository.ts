import { ChannelReputationStats } from 'ca/analytics/domain/value-objects/channel-reputation-stats.vo';

export abstract class ChannelReputationStatsRepository {
  public abstract save(stats: ChannelReputationStats): Promise<void>;
  public abstract findByChannel(
    channelId: string,
  ): Promise<ChannelReputationStats | null>;
  public abstract findAll(): Promise<ReadonlyArray<ChannelReputationStats>>;
  public abstract findTop(
    limit: number,
    minConfidence?: ChannelReputationStats['confidence'],
  ): Promise<ReadonlyArray<ChannelReputationStats>>;
}
