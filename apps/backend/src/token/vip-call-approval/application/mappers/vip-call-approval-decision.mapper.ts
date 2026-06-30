import type { VipCallApprovalDecision } from 'token/vip-call-approval/domain/entities/vip-call-approval-decision.entity';

export interface VipCallApprovalDecisionView {
  readonly id: string;
  readonly chain: string;
  readonly address: string;
  readonly verdict: string;
  readonly score: number;
  readonly classification: string;
  readonly reasons: ReadonlyArray<{ code: string; message: string }>;
  readonly decidedAt: string;
}

export class VipCallApprovalDecisionMapper {
  public static toView(d: VipCallApprovalDecision): VipCallApprovalDecisionView {
    return {
      id: d.id,
      chain: d.chain.value,
      address: d.address,
      verdict: d.verdict.value,
      score: d.score,
      classification: d.classification,
      reasons: d.reasons.map((r) => ({ code: r.code, message: r.message })),
      decidedAt: d.decidedAt.toISOString(),
    };
  }
}
