import { Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { VipCallApprovalDecision } from 'token/vip-call-approval/domain/entities/vip-call-approval-decision.entity';
import { VipCallApprovalDecisionRepository } from 'token/vip-call-approval/application/ports/vip-call-approval-decision.repository';

@Injectable()
export class InMemoryVipCallApprovalDecisionRepository extends VipCallApprovalDecisionRepository {
  private static readonly MAX_ENTRIES = 500;
  private readonly store = new Map<string, VipCallApprovalDecision>();

  public async save(decision: VipCallApprovalDecision): Promise<void> {
    await Promise.resolve();
    this.store.set(decision.id, decision);
    while (
      this.store.size > InMemoryVipCallApprovalDecisionRepository.MAX_ENTRIES
    ) {
      const oldest: string | undefined = this.store.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<VipCallApprovalDecision | null> {
    await Promise.resolve();
    return this.store.get(`${chain.value}:${address.toLowerCase()}`) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime())
      .slice(0, limit);
  }

  public async findApproved(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((d) => d.isApproved)
      .sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime())
      .slice(0, limit);
  }

  public async findRejected(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((d) => !d.isApproved)
      .sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime())
      .slice(0, limit);
  }

  public async countByVerdict(): Promise<{
    readonly approved: number;
    readonly rejected: number;
  }> {
    await Promise.resolve();
    let approved = 0;
    let rejected = 0;
    for (const d of this.store.values()) {
      if (d.isApproved) approved += 1;
      else rejected += 1;
    }
    return { approved, rejected };
  }
}
