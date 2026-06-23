import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  KolReputation,
  KolConfidence,
} from 'telegram-kol/reputation/domain/value-objects/kol-reputation.vo';
import { KolReputationRepository } from 'telegram-kol/reputation/application/ports/kol-reputation.repository';
import { KolReputationEntity } from 'telegram-kol/reputation/infrastructure/persistence/typeorm/entities/kol-reputation.entity';
import { KolReputationMapper } from 'telegram-kol/reputation/infrastructure/persistence/typeorm/mappers/kol-reputation.mapper';

const CONFIDENCE_ORDER: Record<KolConfidence, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  VERY_HIGH: 3,
};

/**
 * Postgres-backed implementation of `KolReputationRepository`.
 *
 * Replaces the FIFO-capped in-memory map (5,000 entries). Critical
 * because `scoring` BC's `DefaultKolReputationAdapter` reads from
 * this repo to compute the kol-reputation multiplier on every
 * token score. With in-memory + FIFO, an active KOL could be
 * evicted by a burst of new KOLs and immediately drop to "unknown"
 * reputation (0.5× score multiplier).
 *
 * `findAll` and `findTop` rely on a `score` index for ordered scans.
 * Confidence-level filtering is done in memory after the DB returns
 * the top candidates — fine because confidence is a discrete enum with
 * only 4 values and we always sort by score.
 */
@Injectable()
export class TypeOrmKolReputationRepository extends KolReputationRepository {
  constructor(
    @InjectRepository(KolReputationEntity)
    private readonly repo: Repository<KolReputationEntity>,
  ) {
    super();
  }

  public async save(stats: KolReputation): Promise<void> {
    const row = KolReputationMapper.toEntity(stats);
    await this.repo.save(row);
  }

  public async findByKol(kolId: string): Promise<KolReputation | null> {
    const row = await this.repo.findOne({ where: { kolId } });
    return row ? KolReputationMapper.toDomain(row) : null;
  }

  public async findByIds(
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<KolReputation>> {
    if (ids.length === 0) return [];
    const rows = await this.repo.find({ where: { kolId: In([...ids]) } });
    return rows.map((r) => KolReputationMapper.toDomain(r));
  }

  public async findAll(): Promise<ReadonlyArray<KolReputation>> {
    const rows = await this.repo.find({ order: { score: 'DESC' } });
    return rows.map((r) => KolReputationMapper.toDomain(r));
  }

  public async findTop(
    limit: number,
    minConfidence?: KolConfidence,
  ): Promise<ReadonlyArray<KolReputation>> {
    const minOrder = minConfidence ? CONFIDENCE_ORDER[minConfidence] : 0;
    const rows = await this.repo.find({
      order: { score: 'DESC' },
      take: limit,
    });
    return rows
      .filter((r) => CONFIDENCE_ORDER[r.confidence] >= minOrder)
      .map((r) => KolReputationMapper.toDomain(r));
  }
}
