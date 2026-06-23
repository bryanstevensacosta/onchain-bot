import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ChainId } from 'chain/identity/chain-id.vo';
import { TokenScore } from 'token/scoring/domain/entities/token-score.entity';
import { TokenScoreRepository } from 'token/scoring/application/ports/token-score.repository';
import { TokenScoreEntity } from 'token/scoring/infrastructure/persistence/typeorm/entities/token-score.entity';
import { TokenScoreMapper } from 'token/scoring/infrastructure/persistence/typeorm/mappers/token-score.mapper';

/**
 * Postgres-backed implementation of `TokenScoreRepository`.
 *
 * Uses TypeORM `save()` (upsert by primary key) so re-scoring a token
 * overwrites the previous row rather than duplicating.
 *
 * Indexed on `scored_at` and `score` for the two main query patterns:
 * - `findRecent` → ORDER BY scored_at DESC LIMIT N
 * - `findTopScores` → WHERE score >= ? ORDER BY score DESC LIMIT N
 */
@Injectable()
export class TypeOrmTokenScoreRepository extends TokenScoreRepository {
  public constructor(
    @InjectRepository(TokenScoreEntity)
    private readonly repo: Repository<TokenScoreEntity>,
  ) {
    super();
  }

  public async save(score: TokenScore): Promise<void> {
    await this.repo.save(TokenScoreMapper.toRow(score));
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<TokenScore | null> {
    const id = `${chain.value}:${address.toLowerCase()}`;
    const row = await this.repo.findOne({ where: { id } });
    return row ? TokenScoreMapper.toDomain(row) : null;
  }

  public async findRecent(limit: number): Promise<ReadonlyArray<TokenScore>> {
    const rows = await this.repo.find({
      order: { scoredAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => TokenScoreMapper.toDomain(r));
  }

  public async findTopScores(
    limit: number,
    minScore: number,
  ): Promise<ReadonlyArray<TokenScore>> {
    const rows = await this.repo.find({
      where: { score: MoreThanOrEqual(minScore) },
      order: { score: 'DESC' },
      take: limit,
    });
    return rows.map((r) => TokenScoreMapper.toDomain(r));
  }
}
