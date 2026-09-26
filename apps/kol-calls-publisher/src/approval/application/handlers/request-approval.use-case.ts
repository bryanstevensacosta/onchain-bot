import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { CallApproval } from '../../domain/entities/call-approval.entity';
import { CallApprovalRepository } from '../ports/call-approval.repository';
import { ScoredCallRepository } from '../../../scoring/application/ports/scored-call.repository';
import { TemplateRepository } from '../../../templates/domain/ports/template.repository';

export interface RequestApprovalInput {
  readonly templateId: string;
  readonly mentionId: string;
}

export interface RequestApprovalOutput {
  readonly approval: CallApproval;
  readonly created: boolean;
}

/**
 * Enqueues one scored mention for template review (creates the PENDING
 * row; idempotent — re-requests return the existing row). The row leaves
 * `pending` via `EvaluateApprovalUseCase` (auto) or the manual
 * approve/reject endpoints. Missing template or unscored mention → 404
 * (below-cut mentions never reach the bouncer — scoring discards them).
 */
@Injectable()
export class RequestApprovalUseCase {
  public constructor(
    private readonly approvals: CallApprovalRepository,
    private readonly scored: ScoredCallRepository,
    private readonly templates: TemplateRepository,
  ) {}

  public async execute(
    input: RequestApprovalInput,
  ): Promise<RequestApprovalOutput> {
    const template = await this.templates.findById(input.templateId);
    if (!template) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `template not found: ${input.templateId}`,
        {
          templateId: input.templateId,
        },
      );
    }
    const scored = await this.scored.findByMentionId(input.mentionId);
    if (!scored) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `scored mention not found: ${input.mentionId}`,
        {
          mentionId: input.mentionId,
        },
      );
    }
    const id = `${template.id}:${scored.mentionId}`;
    const existing = await this.approvals.findById(id);
    if (existing) return { approval: existing, created: false };
    const approval = CallApproval.create({
      templateId: template.id,
      mentionId: scored.mentionId,
      kolId: scored.kolId,
      chain: scored.chain,
      address: scored.address,
      ticker: null,
      score: scored.score,
    });
    await this.approvals.save(approval);
    return { approval, created: true };
  }
}
