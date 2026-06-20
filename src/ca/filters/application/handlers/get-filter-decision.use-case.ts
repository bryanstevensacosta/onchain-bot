import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { FilterDecisionRepository } from 'ca/filters/application/ports/filter-decision.repository';
import {
  FilterDecisionMapper,
  FilterDecisionView,
} from 'ca/filters/application/mappers/filter-decision.mapper';

@Injectable()
export class GetFilterDecisionUseCase {
  public constructor(private readonly decisionRepo: FilterDecisionRepository) {}

  public async execute(
    chain: string,
    address: string,
  ): Promise<FilterDecisionView> {
    const chainVo = ChainId.fromString(chain);
    const decision = await this.decisionRepo.findByChainAndAddress(
      chainVo,
      address.toLowerCase(),
    );
    if (!decision) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `FilterDecision not found: ${chain}:${address}`,
        { chain, address },
      );
    }
    return FilterDecisionMapper.toView(decision);
  }
}
