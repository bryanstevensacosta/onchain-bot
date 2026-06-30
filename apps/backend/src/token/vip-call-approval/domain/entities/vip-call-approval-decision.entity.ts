import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ChainId } from 'chain/identity/chain-id.vo';
import { VipCallApprovalVerdict } from 'token/vip-call-approval/domain/value-objects/vip-call-approval-verdict.vo';
import { VipCallApprovalReason } from 'token/vip-call-approval/domain/value-objects/vip-call-approval-reason.vo';
import { VipCallApprovedEvent } from 'token/vip-call-approval/domain/events/vip-call-approved.event';
import { VipCallRejectedEvent } from 'token/vip-call-approval/domain/events/vip-call-rejected.event';

export interface FilterInput {
  readonly chain: ChainId;
  readonly address: string;
  readonly score: number;
  readonly classification: string;
  readonly riskWeight: number;
  readonly snapshotCompleteness: number;
  readonly reasons: ReadonlyArray<VipCallApprovalReason>;
}

interface VipCallApprovalDecisionProps {
  readonly chain: ChainId;
  readonly address: string;
  readonly verdict: VipCallApprovalVerdict;
  readonly score: number;
  readonly classification: string;
  readonly reasons: ReadonlyArray<VipCallApprovalReason>;
  readonly decidedAt: Date;
}

/**
 * Final filter decision for a token.
 *
 * Verdict is derived from `reasons`:
 * - Empty reasons → APPROVED
 * - Any reason → REJECTED
 */
export class VipCallApprovalDecision extends AggregateRoot<string> {
  private readonly state: VipCallApprovalDecisionProps;

  protected constructor(id: string, props: VipCallApprovalDecisionProps) {
    super(id);
    this.state = props;
  }

  public static create(input: FilterInput): VipCallApprovalDecision {
    if (!input.address) {
      throw new DomainError(ErrorCode.VALIDATION, `address cannot be empty`);
    }
    const verdict =
      input.reasons.length === 0
        ? VipCallApprovalVerdict.APPROVED
        : VipCallApprovalVerdict.REJECTED;
    const normalizedAddr =
      input.chain.value === 'solana'
        ? input.address
        : input.address.toLowerCase();
    const id = `${input.chain.value}:${normalizedAddr}`;
    return new VipCallApprovalDecision(id, {
      chain: input.chain,
      address: normalizedAddr,
      verdict,
      score: input.score,
      classification: input.classification,
      reasons: Object.freeze([...input.reasons]),
      decidedAt: new Date(),
    });
  }

  /**
   * Reconstruct an aggregate from persistence. Bypasses factory validation
   * and verdict recomputation — assumes the DB stored a coherent state.
   */
  public static rehydrate(input: {
    id: string;
    chain: ChainId;
    address: string;
    verdict: VipCallApprovalVerdict;
    score: number;
    classification: string;
    reasons: ReadonlyArray<VipCallApprovalReason>;
    decidedAt: Date;
  }): VipCallApprovalDecision {
    return new VipCallApprovalDecision(input.id, {
      chain: input.chain,
      address: input.address,
      verdict: input.verdict,
      score: input.score,
      classification: input.classification,
      reasons: input.reasons,
      decidedAt: input.decidedAt,
    });
  }

  public get chain(): ChainId {
    return this.state.chain;
  }
  public get address(): string {
    return this.state.address;
  }
  public get verdict(): VipCallApprovalVerdict {
    return this.state.verdict;
  }
  public get score(): number {
    return this.state.score;
  }
  public get classification(): string {
    return this.state.classification;
  }
  public get reasons(): ReadonlyArray<VipCallApprovalReason> {
    return this.state.reasons;
  }
  public get decidedAt(): Date {
    return this.state.decidedAt;
  }
  public get isApproved(): boolean {
    return this.state.verdict.isApproved();
  }

  public emit(): void {
    if (this.isApproved) {
      this.apply(
        new VipCallApprovedEvent({
          chain: this.state.chain.value,
          address: this.state.address,
          score: this.state.score,
          classification: this.state.classification,
          decidedAt: this.state.decidedAt,
        }),
      );
    } else {
      this.apply(
        new VipCallRejectedEvent({
          chain: this.state.chain.value,
          address: this.state.address,
          score: this.state.score,
          classification: this.state.classification,
          reasons: this.state.reasons.map((r) => ({
            code: r.code,
            message: r.message,
          })),
          decidedAt: this.state.decidedAt,
        }),
      );
    }
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
