import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { VipCallApprovalDecisionRepository } from 'token/vip-call-approval/application/ports/vip-call-approval-decision.repository';
import {
  VipCallApprovalDecisionMapper,
  VipCallApprovalDecisionView,
} from 'token/vip-call-approval/application/mappers/vip-call-approval-decision.mapper';

export type VipCallApprovalListKind = 'recent' | 'approved' | 'rejected';

@Injectable()
export class ListVipCallApprovalDecisionsUseCase {
  public constructor(private readonly decisionRepo: VipCallApprovalDecisionRepository) {}

  public async execute(
    kind: VipCallApprovalListKind,
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecisionView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid limit: ${limit}`, {
        limit,
      });
    }
    const items =
      kind === 'approved'
        ? await this.decisionRepo.findApproved(limit)
        : kind === 'rejected'
          ? await this.decisionRepo.findRejected(limit)
          : await this.decisionRepo.findRecent(limit);
    return items.map((d) => VipCallApprovalDecisionMapper.toView(d));
  }
}
