import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChainId } from 'chain/identity/chain-id.vo';
import { VipCallApprovalDecision } from 'token/vip-call-approval/domain/entities/vip-call-approval-decision.entity';
import { VipCallApprovalDecisionRepository } from 'token/vip-call-approval/application/ports/vip-call-approval-decision.repository';
import { VipCallApprovalDecisionEntity } from 'token/vip-call-approval/infrastructure/persistence/typeorm/entities/vip-call-approval-decision.entity';
import { VipCallApprovalDecisionMapper } from 'token/vip-call-approval/infrastructure/persistence/typeorm/mappers/vip-call-approval-decision.mapper';

@Injectable()
export class TypeOrmVipCallApprovalDecisionRepository extends VipCallApprovalDecisionRepository {
  public constructor(
    @InjectRepository(VipCallApprovalDecisionEntity)
    private readonly repo: Repository<VipCallApprovalDecisionEntity>,
  ) {
    super();
  }

  public async save(decision: VipCallApprovalDecision): Promise<void> {
    await this.repo.save(VipCallApprovalDecisionMapper.toRow(decision));
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<VipCallApprovalDecision | null> {
    const id = `${chain.value}:${address.toLowerCase()}`;
    const row = await this.repo.findOne({ where: { id } });
    return row ? VipCallApprovalDecisionMapper.toDomain(row) : null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>> {
    const rows = await this.repo.find({
      order: { decidedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => VipCallApprovalDecisionMapper.toDomain(r));
  }

  public async findApproved(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>> {
    const rows = await this.repo.find({
      where: { verdict: 'APPROVED' },
      order: { decidedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => VipCallApprovalDecisionMapper.toDomain(r));
  }

  public async findRejected(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>> {
    const rows = await this.repo.find({
      where: { verdict: 'REJECTED' },
      order: { decidedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => VipCallApprovalDecisionMapper.toDomain(r));
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
