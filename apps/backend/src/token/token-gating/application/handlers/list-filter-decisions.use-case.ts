import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { FilterDecisionRepository } from 'token/token-gating/application/ports/filter-decision.repository';
import {
  FilterDecisionMapper,
  FilterDecisionView,
} from 'token/token-gating/application/mappers/filter-decision.mapper';

export type FilterListKind = 'recent' | 'approved' | 'rejected';

@Injectable()
export class ListFilterDecisionsUseCase {
  public constructor(private readonly decisionRepo: FilterDecisionRepository) {}

  public async execute(
    kind: FilterListKind,
    limit: number,
  ): Promise<ReadonlyArray<FilterDecisionView>> {
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
    return items.map((d) => FilterDecisionMapper.toView(d));
  }
}
