import { Injectable } from '@nestjs/common';
import { ChannelReputationStats } from 'ca/analytics/domain/value-objects/channel-reputation-stats.vo';
import { ChannelReputationStatsRepository } from 'ca/analytics/application/ports/channel-reputation-stats.repository';

@Injectable()
export class InMemoryChannelReputationStatsRepository extends ChannelReputationStatsRepository {
  private static readonly MAX_ENTRIES = 5000;
  private readonly store = new Map<string, ChannelReputationStats>();

  public async save(stats: ChannelReputationStats): Promise<void> {
    await Promise.resolve();
    this.store.set(stats.channelId, stats);
    while (
      this.store.size > InMemoryChannelReputationStatsRepository.MAX_ENTRIES
    ) {
      const oldest: string | undefined = this.store.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  public async findByChannel(
    channelId: string,
  ): Promise<ChannelReputationStats | null> {
    await Promise.resolve();
    return this.store.get(channelId) ?? null;
  }

  public async findAll(): Promise<ReadonlyArray<ChannelReputationStats>> {
    await Promise.resolve();
    return Array.from(this.store.values()).sort((a, b) => b.score - a.score);
  }

  public async findTop(
    limit: number,
    minConfidence?: ChannelReputationStats['confidence'],
  ): Promise<ReadonlyArray<ChannelReputationStats>> {
    await Promise.resolve();
    const confidenceOrder: Record<string, number> = {
      LOW: 0,
      MEDIUM: 1,
      HIGH: 2,
      VERY_HIGH: 3,
    };
    const minOrder = minConfidence ? confidenceOrder[minConfidence] : 0;
    return Array.from(this.store.values())
      .filter((s) => confidenceOrder[s.confidence] >= minOrder)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
