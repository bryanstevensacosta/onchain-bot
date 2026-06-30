import { VipCallApprovalDecision } from 'token/vip-call-approval/domain/entities/vip-call-approval-decision.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { VipCallApprovalVerdict } from 'token/vip-call-approval/domain/value-objects/vip-call-approval-verdict.vo';
import { VipCallApprovalReason } from 'token/vip-call-approval/domain/value-objects/vip-call-approval-reason.vo';
import { VipCallApprovalDecisionEntity } from 'token/vip-call-approval/infrastructure/persistence/typeorm/entities/vip-call-approval-decision.entity';

export class VipCallApprovalDecisionMapper {
  public static toRow(d: VipCallApprovalDecision): VipCallApprovalDecisionEntity {
    const row = new VipCallApprovalDecisionEntity();
    row.id = d.id;
    row.chain = d.chain.value;
    row.address = d.address;
    row.verdict = d.verdict.value;
    row.score = d.score;
    row.classification = d.classification;
    row.reasons = d.reasons.map((r) => ({ code: r.code, message: r.message }));
    row.decidedAt = d.decidedAt;
    return row;
  }

  public static toDomain(row: VipCallApprovalDecisionEntity): VipCallApprovalDecision {
    const reasons = row.reasons.map((r) =>
      VipCallApprovalReason.create({ code: r.code as never, message: r.message }),
    );
    return VipCallApprovalDecision.rehydrate({
      id: row.id,
      chain: ChainId.fromString(row.chain),
      address: row.address,
      verdict: VipCallApprovalVerdict.fromString(row.verdict),
      score: row.score,
      classification: row.classification,
      reasons,
      decidedAt: row.decidedAt,
    });
  }
}
