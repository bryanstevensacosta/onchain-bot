import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { ConfidenceLevel } from 'discovery/analytics/domain/value-objects/channel-reputation-stats.vo';

/**
 * TypeORM persistence shape for `ChannelReputationStats`.
 *
 * One row per channel (PK = `channel_id`). Used by `scoring` BC's
 * `DefaultChannelReputationAdapter` via `findByChannel` — losing these
 * rows drops the channel-reputation multiplier on every score, so PG
 * persistence is what keeps the feature alive across restarts.
 *
 * PG-specific column types — see `telegram-channel.entity.ts` for the
 * rationale and the trade-off of not having cross-driver unit tests.
 */
@Entity({ name: 'channel_reputation_stats' })
@Index('idx_channel_reputation_stats_score', ['score'])
export class ChannelReputationStatsEntity {
  @PrimaryColumn({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ name: 'score', type: 'real' })
  public score!: number;

  @Column({ name: 'total_calls', type: 'integer', default: 0 })
  public totalCalls!: number;

  @Column({ name: 'strong_calls', type: 'integer', default: 0 })
  public strongCalls!: number;

  @Column({ name: 'good_calls', type: 'integer', default: 0 })
  public goodCalls!: number;

  @Column({ name: 'neutral_calls', type: 'integer', default: 0 })
  public neutralCalls!: number;

  @Column({ name: 'poor_calls', type: 'integer', default: 0 })
  public poorCalls!: number;

  @Column({ name: 'failed_calls', type: 'integer', default: 0 })
  public failedCalls!: number;

  @Column({
    name: 'avg_ath_multiple',
    type: 'real',
    nullable: true,
  })
  public avgAthMultiple!: number | null;

  @Column({ name: 'confidence', type: 'varchar', length: 16 })
  public confidence!: ConfidenceLevel;

  @Column({ name: 'last_evaluated_at', type: 'timestamptz' })
  public lastEvaluatedAt!: Date;
}
