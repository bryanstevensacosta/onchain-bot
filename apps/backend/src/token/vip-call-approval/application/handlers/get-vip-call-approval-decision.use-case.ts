import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainId } from 'chain/identity/chain-id.vo';
import { VipCallApprovalDecisionRepository } from 'token/vip-call-approval/application/ports/vip-call-approval-decision.repository';
import {
  VipCallApprovalDecisionMapper,
  VipCallApprovalDecisionView,
} from 'token/vip-call-approval/application/mappers/vip-call-approval-decision.mapper';

@Injectable()
export class GetVipCallApprovalDecisionUseCase {
  public constructor(
    private readonly decisionRepo: VipCallApprovalDecisionRepository,
  ) {}

  public async execute(
    chain: string,
    address: string,
  ): Promise<VipCallApprovalDecisionView> {
    const chainVo = ChainId.fromString(chain);
    const decision = await this.decisionRepo.findByChainAndAddress(
      chainVo,
      address.toLowerCase(),
    );
    if (!decision) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `VipCallApprovalDecision not found: ${chain}:${address}`,
        { chain, address },
      );
    }
    return VipCallApprovalDecisionMapper.toView(decision);
  }
}
