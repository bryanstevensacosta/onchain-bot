import { Injectable } from '@nestjs/common';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { FilterDecision } from 'discovery/filters/domain/entities/filter-decision.entity';
import { FilterDecisionRepository } from 'discovery/filters/application/ports/filter-decision.repository';

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
}
