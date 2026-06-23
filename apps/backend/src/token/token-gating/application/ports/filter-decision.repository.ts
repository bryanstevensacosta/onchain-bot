import { FilterDecision } from 'token/token-gating/domain/entities/filter-decision.entity';
import { ChainId } from 'chain/identity/chain-id.vo';

export abstract class FilterDecisionRepository {
  public abstract save(decision: FilterDecision): Promise<void>;
  public abstract findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<FilterDecision | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>>;
  public abstract findApproved(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>>;
  public abstract findRejected(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>>;
  /**
   * Single-pass count of decisions grouped by verdict. Returns
   * `{ approved, rejected }` so the dashboard KPI endpoint doesn't
   * have to fetch rows just to count.
   */
  public abstract countByVerdict(): Promise<{
    readonly approved: number;
    readonly rejected: number;
  }>;
}
