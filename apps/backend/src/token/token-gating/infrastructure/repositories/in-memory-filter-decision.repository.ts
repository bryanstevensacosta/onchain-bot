import { Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { FilterDecision } from 'token/token-gating/domain/entities/filter-decision.entity';
import { FilterDecisionRepository } from 'token/token-gating/application/ports/filter-decision.repository';

@Injectable()
export class InMemoryFilterDecisionRepository extends FilterDecisionRepository {
  private static readonly MAX_ENTRIES = 500;
  private readonly store = new Map<string, FilterDecision>();

  public async save(decision: FilterDecision): Promise<void> {
    await Promise.resolve();
    this.store.set(decision.id, decision);
    while (this.store.size > InMemoryFilterDecisionRepository.MAX_ENTRIES) {
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
  ): Promise<FilterDecision | null> {
    await Promise.resolve();
    return this.store.get(`${chain.value}:${address.toLowerCase()}`) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime())
      .slice(0, limit);
  }

  public async findApproved(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((d) => d.isApproved)
      .sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime())
      .slice(0, limit);
  }

  public async findRejected(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>> {
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
