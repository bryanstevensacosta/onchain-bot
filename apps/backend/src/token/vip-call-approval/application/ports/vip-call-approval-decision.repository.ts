import { VipCallApprovalDecision } from 'token/vip-call-approval/domain/entities/vip-call-approval-decision.entity';
import { ChainId } from 'chain/identity/chain-id.vo';

export abstract class VipCallApprovalDecisionRepository {
  public abstract save(decision: VipCallApprovalDecision): Promise<void>;
  public abstract findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<VipCallApprovalDecision | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>>;
  public abstract findApproved(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>>;
  public abstract findRejected(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>>;
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
