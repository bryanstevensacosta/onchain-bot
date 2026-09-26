import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { CallApproval } from '../../domain/entities/call-approval.entity';
import { CallApprovalRepository } from '../ports/call-approval.repository';

export interface GetPendingApprovalsInput {
  readonly templateId?: string;
  readonly limit?: number;
}

export interface GetPendingApprovalsOutput {
  readonly templateId: string | null;
  readonly pending: CallApproval[];
}

/**
 * Lists undecided approvals, newest first (dashboard bouncer queue).
 * `templateId` scopes to one template; omitted = all templates.
 */
@Injectable()
export class GetPendingApprovalsUseCase {
  public constructor(private readonly approvals: CallApprovalRepository) {}

  public async execute(
    input: GetPendingApprovalsInput,
  ): Promise<GetPendingApprovalsOutput> {
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `limit must be 1..500, got ${input.limit}`,
        {
          limit: input.limit,
        },
      );
    }
    const pending = input.templateId
      ? await this.approvals.findPendingByTemplate(input.templateId, limit)
      : await this.approvals.findPendingAll(limit);
    return { templateId: input.templateId ?? null, pending };
  }
}
