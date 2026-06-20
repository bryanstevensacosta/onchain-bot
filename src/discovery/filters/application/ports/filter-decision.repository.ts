import { FilterDecision } from 'discovery/filters/domain/entities/filter-decision.entity';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';

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
}
