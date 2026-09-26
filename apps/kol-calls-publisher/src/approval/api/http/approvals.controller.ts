import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { DomainExceptionFilter } from '../../../shared/filters/domain-exception.filter';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { CallApproval } from '../../domain/entities/call-approval.entity';
import { CallApprovalRepository } from '../../application/ports/call-approval.repository';
import { EvaluateApprovalUseCase } from '../../application/handlers/evaluate-approval.use-case';
import { RequestApprovalUseCase } from '../../application/handlers/request-approval.use-case';
import { GetPendingApprovalsUseCase } from '../../application/handlers/get-pending-approvals.use-case';
import {
  DecideApprovalDto,
  EvaluateApprovalDto,
  PendingQueryDto,
} from './dto/approval.dto';

function toJson(approval: CallApproval): Record<string, unknown> {
  return {
    id: approval.id,
    templateId: approval.templateId,
    mentionId: approval.mentionId,
    kolId: approval.kolId,
    chain: approval.chain,
    address: approval.address,
    ticker: approval.ticker,
    score: approval.score,
    status: approval.status,
    reason: approval.reason,
    decidedBy: approval.decidedBy,
    decidedAt: approval.decidedAt?.toISOString() ?? null,
    createdAt: approval.createdAtDate.toISOString(),
  };
}

/**
 * Approvals controller (Tramo 1, todo 11, Ph10 API).
 *
 * `GET /api/approvals/pending` (acceptance endpoint — `jq length >= 0`)
 * + `POST /api/approvals/request` (enqueue a mention for review) +
 * `POST /api/approvals/evaluate` (auto per-template decision) +
 * manual `POST /api/approvals/:id/approve|reject`.
 */
@Controller('api/approvals')
@UseFilters(DomainExceptionFilter)
export class ApprovalsController {
  public constructor(
    private readonly approvals: CallApprovalRepository,
    private readonly evaluate: EvaluateApprovalUseCase,
    private readonly request: RequestApprovalUseCase,
    private readonly pending: GetPendingApprovalsUseCase,
  ) {}

  @Get('pending')
  public async getPending(
    @Query() query: PendingQueryDto,
  ): Promise<Record<string, unknown>> {
    const { templateId, pending } = await this.pending.execute({
      templateId: query.templateId,
      limit: query.limit,
    });
    return { templateId, pending: pending.map(toJson) };
  }

  @Post('request')
  @HttpCode(201)
  public async requestOne(
    @Body() dto: EvaluateApprovalDto,
  ): Promise<Record<string, unknown>> {
    const { approval } = await this.request.execute({
      templateId: dto.templateId,
      mentionId: dto.mentionId,
    });
    return toJson(approval);
  }

  @Post('evaluate')
  @HttpCode(201)
  public async evaluateOne(
    @Body() dto: EvaluateApprovalDto,
  ): Promise<Record<string, unknown>> {
    const { approval } = await this.evaluate.execute({
      templateId: dto.templateId,
      mentionId: dto.mentionId,
      decidedBy: dto.decidedBy,
    });
    return toJson(approval);
  }

  @Post(':id/approve')
  @HttpCode(201)
  public async approveOne(
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
  ): Promise<Record<string, unknown>> {
    const approval = await this.mustFind(id);
    approval.approve(dto.decidedBy ?? 'manual');
    await this.approvals.save(approval);
    approval.commit();
    return toJson(approval);
  }

  @Post(':id/reject')
  @HttpCode(201)
  public async rejectOne(
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
  ): Promise<Record<string, unknown>> {
    const approval = await this.mustFind(id);
    approval.reject(dto.reason ?? 'MANUAL', dto.decidedBy ?? 'manual');
    await this.approvals.save(approval);
    approval.commit();
    return toJson(approval);
  }

  private async mustFind(id: string): Promise<CallApproval> {
    const approval = await this.approvals.findById(id);
    if (!approval) {
      throw new DomainError(ErrorCode.NOT_FOUND, `approval not found: ${id}`, {
        id,
      });
    }
    return approval;
  }
}
