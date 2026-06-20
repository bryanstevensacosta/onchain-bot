import { Injectable, Logger } from '@nestjs/common';
import { ChannelReputation } from 'ca/scoring/domain/value-objects/channel-reputation.vo';
import { ChannelReputationPort } from 'ca/scoring/domain/ports/channel-reputation.port';
import { ChannelReputationStatsRepository } from 'ca/analytics/application/ports/channel-reputation-stats.repository';

/**
 * Channel reputation adapter.
 *
 * Resolution order (first hit wins):
 * 1. KNOWN_BAD list → 0.1 (always)
 * 2. KNOWN_GOOD list → static default (always)
 * 3. Real historical stats from Analytics BC → real score (if confidence != LOW)
 * 4. Unknown channel with no history → 0.5 (neutral)
 *
 * KNOWN_BAD overrides real stats (a known scammer stays a spammer
 * regardless of past performance).
 */
@Injectable()
export class DefaultChannelReputationAdapter extends ChannelReputationPort {
  private readonly logger = new Logger(DefaultChannelReputationAdapter.name);

  private static readonly KNOWN_GOOD: Map<string, number> = new Map([
    ['spydefi', 0.95],
    ['whaleinsiders', 0.9],
    ['alpha_calls', 0.85],
    ['sol_calls', 0.85],
    ['defi_alpha_hub', 0.85],
    ['gem_finder', 0.8],
    ['onchainalpha', 0.9],
    ['smart_trader_calls', 0.85],
    ['pepe', 0.6],
  ]);

  private static readonly KNOWN_BAD: Set<string> = new Set([
    'free_airdrop_spam',
    'pump_guaranteed',
  ]);

  public constructor(
    private readonly statsRepo: ChannelReputationStatsRepository,
  ) {
    super();
  }

  public async getReputation(channelId: string): Promise<ChannelReputation> {
    const lookup = channelId.toLowerCase();
    if (DefaultChannelReputationAdapter.KNOWN_BAD.has(lookup)) {
      return await Promise.resolve(
        ChannelReputation.create({ channelId, score: 0.1, mentionCount: 0 }),
      );
    }
    const known = DefaultChannelReputationAdapter.KNOWN_GOOD.get(lookup);
    if (known !== undefined) {
      return await Promise.resolve(
        ChannelReputation.create({ channelId, score: known, mentionCount: 0 }),
      );
    }
    const stats = await this.statsRepo.findByChannel(channelId);
    if (stats && stats.confidence !== 'LOW' && stats.totalCalls > 0) {
      return await Promise.resolve(
        ChannelReputation.create({
          channelId,
          score: stats.score,
          mentionCount: stats.totalCalls,
        }),
      );
    }
    this.logger.debug(`Unknown channel, default reputation: ${channelId}`);
    return await Promise.resolve(ChannelReputation.unknown(channelId));
  }

  public async getAverageReputation(
    channelIds: ReadonlyArray<string>,
  ): Promise<number> {
    if (channelIds.length === 0) return 0.5;
    const reps = await Promise.all(
      channelIds.map((id) => this.getReputation(id)),
    );
    const sum = reps.reduce((acc, r) => acc + r.score, 0);
    return sum / reps.length;
  }
}
