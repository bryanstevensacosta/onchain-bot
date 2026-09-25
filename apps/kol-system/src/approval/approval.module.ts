import { Module, forwardRef } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { TemplatesModule } from '../templates/templates.module';
import { CallApprovalRepository } from './application/ports/call-approval.repository';
import { InMemoryCallApprovalRepository } from './infrastructure/repositories/in-memory-call-approval.repository';
import { EvaluateApprovalUseCase } from './application/handlers/evaluate-approval.use-case';
import { RequestApprovalUseCase } from './application/handlers/request-approval.use-case';
import { GetPendingApprovalsUseCase } from './application/handlers/get-pending-approvals.use-case';
import { ApprovalsController } from './api/http/approvals.controller';
import { ApprovalHealthIndicator } from './health/approval-health.indicator';

/**
 * ApprovalModule — per-template bouncer (Tramo 1, todo 11, Ph10).
 *
 * `CallApproval` (id `templateId:mentionId`, P1 upsert guard) +
 * `EvaluateApprovalUseCase` (auto decision: active + source visible P16 +
 * score floor, direct call fix-1) + `GetPendingApprovalsUseCase` +
 * `ApprovalsController` (`GET /api/approvals/pending`, `POST evaluate`,
 * manual approve/reject). Reads gate-passing mentions from
 * `ScoringModule` and template rules from `TemplatesModule`
 * (forwardRef — templates pulls pending-approvals back for its stub).
 */
@Module({
  imports: [ScoringModule, forwardRef(() => TemplatesModule)],
  controllers: [ApprovalsController],
  providers: [
    EvaluateApprovalUseCase,
    RequestApprovalUseCase,
    GetPendingApprovalsUseCase,
    ApprovalHealthIndicator,
    {
      provide: CallApprovalRepository,
      useClass: InMemoryCallApprovalRepository,
    },
  ],
  exports: [
    EvaluateApprovalUseCase,
    RequestApprovalUseCase,
    GetPendingApprovalsUseCase,
    CallApprovalRepository,
    ApprovalHealthIndicator,
  ],
})
export class ApprovalModule {}
