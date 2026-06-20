import { ChannelReputationStats } from 'discovery/analytics/domain/value-objects/channel-reputation-stats.vo';
import { ChannelReputationStatsEntity } from 'discovery/analytics/infrastructure/persistence/typeorm/entities/channel-reputation-stats.entity';

export class ChannelReputationStatsMapper {
  public static toEntity(
    stats: ChannelReputationStats,
  ): ChannelReputationStatsEntity {
    const row = new ChannelReputationStatsEntity();
    row.channelId = stats.channelId;
    row.score = stats.score;
    row.totalCalls = stats.totalCalls;
    row.strongCalls = stats.strongCalls;
    row.goodCalls = stats.goodCalls;
    row.neutralCalls = stats.neutralCalls;
    row.poorCalls = stats.poorCalls;
    row.failedCalls = stats.failedCalls;
    row.avgAthMultiple = stats.avgAthMultiple;
    row.confidence = stats.confidence;
    row.lastEvaluatedAt = stats.lastEvaluatedAt;
    return row;
  }

  public static toDomain(
    row: ChannelReputationStatsEntity,
  ): ChannelReputationStats {
    return ChannelReputationStats.fromValues({
      channelId: row.channelId,
      score: row.score,
      totalCalls: row.totalCalls,
      strongCalls: row.strongCalls,
      goodCalls: row.goodCalls,
      neutralCalls: row.neutralCalls,
      poorCalls: row.poorCalls,
      failedCalls: row.failedCalls,
      avgAthMultiple: row.avgAthMultiple,
      confidence: row.confidence,
      lastEvaluatedAt: row.lastEvaluatedAt,
    });
  }
}
