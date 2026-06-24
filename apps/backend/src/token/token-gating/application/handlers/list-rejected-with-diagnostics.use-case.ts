import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { FilterDecisionRepository } from 'token/token-gating/application/ports/filter-decision.repository';
import {
  VerifyRejectedTokenUseCase,
  RejectedTokenDiagnostics,
} from './verify-rejected-token.use-case';

@Injectable()
export class ListRejectedWithDiagnosticsUseCase {
  public constructor(
    private readonly decisionRepo: FilterDecisionRepository,
    private readonly verify: VerifyRejectedTokenUseCase,
  ) {}

  public async execute(input: {
    limit: number;
    retryableOnly: boolean;
  }): Promise<ReadonlyArray<RejectedTokenDiagnostics>> {
    if (
      !Number.isInteger(input.limit) ||
      input.limit <= 0 ||
      input.limit > 500
    ) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid limit: ${input.limit}`,
        {
          limit: input.limit,
        },
      );
    }

    const decisions = await this.decisionRepo.findRejected(input.limit);
    const diagnostics = await Promise.all(
      decisions.map((d) =>
        this.verify.execute({ chain: d.chain.value, address: d.address }),
      ),
    );

    if (!input.retryableOnly) {
      return diagnostics;
    }

    return diagnostics.filter(
      (d) =>
        d.recommended !== 'SKIP' && d.recommended !== 'NEEDS_BLACKLIST_REVIEW',
    );
  }
}
