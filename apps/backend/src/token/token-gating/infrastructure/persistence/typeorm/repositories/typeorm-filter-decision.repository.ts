import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChainId } from 'chain/identity/chain-id.vo';
import { FilterDecision } from 'token/token-gating/domain/entities/filter-decision.entity';
import { FilterDecisionRepository } from 'token/token-gating/application/ports/filter-decision.repository';
import { FilterDecisionEntity } from 'token/token-gating/infrastructure/persistence/typeorm/entities/filter-decision.entity';
import { FilterDecisionMapper } from 'token/token-gating/infrastructure/persistence/typeorm/mappers/filter-decision.mapper';

@Injectable()
export class TypeOrmFilterDecisionRepository extends FilterDecisionRepository {
  public constructor(
    @InjectRepository(FilterDecisionEntity)
    private readonly repo: Repository<FilterDecisionEntity>,
  ) {
    super();
  }

  public async save(decision: FilterDecision): Promise<void> {
    await this.repo.save(FilterDecisionMapper.toRow(decision));
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<FilterDecision | null> {
    const id = `${chain.value}:${address.toLowerCase()}`;
    const row = await this.repo.findOne({ where: { id } });
    return row ? FilterDecisionMapper.toDomain(row) : null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>> {
    const rows = await this.repo.find({
      order: { decidedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => FilterDecisionMapper.toDomain(r));
  }

  public async findApproved(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>> {
    const rows = await this.repo.find({
      where: { verdict: 'APPROVED' },
      order: { decidedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => FilterDecisionMapper.toDomain(r));
  }

  public async findRejected(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>> {
    const rows = await this.repo.find({
      where: { verdict: 'REJECTED' },
      order: { decidedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => FilterDecisionMapper.toDomain(r));
  }

  public async countByVerdict(): Promise<{
    readonly approved: number;
    readonly rejected: number;
  }> {
    // Single SQL round-trip with FILTER aggregates. Falls back to two
    // count queries if the dialect doesn't support FILTER.
    const rows = await this.repo
      .createQueryBuilder('d')
      .select('d.verdict', 'verdict')
      .addSelect('COUNT(*)', 'count')
      .groupBy('d.verdict')
      .getRawMany<{ verdict: 'APPROVED' | 'REJECTED'; count: string }>();
    let approved = 0;
    let rejected = 0;
    for (const r of rows) {
      const n = parseInt(r.count, 10);
      if (r.verdict === 'APPROVED') approved = n;
      else rejected = n;
    }
    return { approved, rejected };
  }
}
