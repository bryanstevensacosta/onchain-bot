import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChannelReputationStats,
  ConfidenceLevel,
} from 'ca/analytics/domain/value-objects/channel-reputation-stats.vo';
import { ChannelReputationStatsRepository } from 'ca/analytics/application/ports/channel-reputation-stats.repository';
import { ChannelReputationStatsEntity } from 'ca/analytics/infrastructure/persistence/typeorm/entities/channel-reputation-stats.entity';
import { ChannelReputationStatsMapper } from 'ca/analytics/infrastructure/persistence/typeorm/mappers/channel-reputation-stats.mapper';

const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  VERY_HIGH: 3,
};

/**
 * Postgres-backed implementation of `ChannelReputationStatsRepository`.
 *
 * Replaces the FIFO-capped in-memory map (5,000 entries). Critical
 * because `scoring` BC's `DefaultChannelReputationAdapter` reads from
 * this repo to compute the channel-reputation multiplier on every
 * token score. With in-memory + FIFO, an active channel could be
 * evicted by a burst of new channels and immediately drop to "unknown"
 * reputation (0.5× score multiplier).
 *
 * `findAll` and `findTop` rely on a `score` index for ordered scans.
 * Confidence-level filtering is done in memory after the DB returns
 * the top candidates — fine because confidence is a discrete enum with
 * only 4 values and we always sort by score.
 */
@Injectable()
export class TypeOrmChannelReputationStatsRepository extends ChannelReputationStatsRepository {
  constructor(
    @InjectRepository(ChannelReputationStatsEntity)
    private readonly repo: Repository<ChannelReputationStatsEntity>,
  ) {
    super();
  }

  public async save(stats: ChannelReputationStats): Promise<void> {
    const row = ChannelReputationStatsMapper.toEntity(stats);
    await this.repo.save(row);
  }

  public async findByChannel(
    channelId: string,
  ): Promise<ChannelReputationStats | null> {
    const row = await this.repo.findOne({ where: { channelId } });
    return row ? ChannelReputationStatsMapper.toDomain(row) : null;
  }

  public async findAll(): Promise<ReadonlyArray<ChannelReputationStats>> {
    const rows = await this.repo.find({ order: { score: 'DESC' } });
    return rows.map((r) => ChannelReputationStatsMapper.toDomain(r));
  }

  public async findTop(
    limit: number,
    minConfidence?: ConfidenceLevel,
  ): Promise<ReadonlyArray<ChannelReputationStats>> {
    const minOrder = minConfidence ? CONFIDENCE_ORDER[minConfidence] : 0;
    const rows = await this.repo.find({
      order: { score: 'DESC' },
      take: limit,
    });
    return rows
      .filter((r) => CONFIDENCE_ORDER[r.confidence] >= minOrder)
      .map((r) => ChannelReputationStatsMapper.toDomain(r));
  }
}
