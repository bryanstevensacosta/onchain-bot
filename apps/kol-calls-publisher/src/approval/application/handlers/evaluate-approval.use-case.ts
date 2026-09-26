import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { DomainEvent } from '../../../shared/kernel/domain-event';
import {
  CallApproval,
  type DecidedBy,
} from '../../domain/entities/call-approval.entity';
import { CallApprovalRepository } from '../ports/call-approval.repository';
import { ScoredCallRepository } from '../../../scoring/application/ports/scored-call.repository';
import { TemplateRepository } from '../../../templates/domain/ports/template.repository';

export interface EvaluateApprovalInput {
  readonly templateId: string;
  readonly mentionId: string;
  readonly decidedBy?: DecidedBy;
}

export interface EvaluateApprovalOutput {
  readonly approval: CallApproval;
  readonly events: DomainEvent[];
}

/**
 * Per-template approval evaluation (Tramo 1, todo 11, Ph10).
 *
 * DIRECT call (fix-1, no event bus): loads the gate-passing `ScoredCall`
 * (below-cut mentions never reach here — scoring discards them) + the
 * template, then applies the template rules in order: inactive template →
 * source outside the selector (P16, empty = all) → score below the display
 * floor → approve. Persists the decision (upsert = P1 guard) and returns
 * the `approval.call.decided` event directly.
 */
@Injectable()
export class EvaluateApprovalUseCase {
  public constructor(
    private readonly approvals: CallApprovalRepository,
    private readonly scored: ScoredCallRepository,
    private readonly templates: TemplateRepository,
  ) {}

  public async execute(
    input: EvaluateApprovalInput,
  ): Promise<EvaluateApprovalOutput> {
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
    const decidedBy = input.decidedBy ?? 'auto';
    const approval =
      (await this.approvals.findById(`${template.id}:${scored.mentionId}`)) ??
      CallApproval.create({
        templateId: template.id,
        mentionId: scored.mentionId,
        kolId: scored.kolId,
        chain: scored.chain,
        address: scored.address,
        ticker: null,
        score: scored.score,
      });

    if (approval.status === 'pending') {
      const reason = this.evaluate(template, scored.kolId, scored.score);
      if (reason === null) {
        approval.approve(decidedBy);
      } else {
        approval.reject(reason, decidedBy);
      }
    }
    await this.approvals.save(approval);
    return { approval, events: approval.commit() };
  }

  private evaluate(
    template: {
      active: boolean;
      kolSourceIds: ReadonlyArray<string>;
      minVisibleScore: number;
    },
    kolId: string,
    score: number,
  ): string | null {
    if (!template.active) return 'TEMPLATE_INACTIVE';
    if (
      template.kolSourceIds.length > 0 &&
      !template.kolSourceIds.includes(kolId)
    ) {
      return 'SOURCE_NOT_VISIBLE';
    }
    if (score < template.minVisibleScore) return 'SCORE_BELOW_FLOOR';
    return null;
  }
}
