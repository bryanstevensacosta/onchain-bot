import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { DomainExceptionFilter } from '../../../shared/filters/domain-exception.filter';
import { ApiKeyGuard } from '../../../shared/guards/api-key.guard';
import {
  OWNER_ID_HEADER,
  normalizeOwnerId,
} from '../../../shared/guards/owner-binding';
import type { PublishingJob } from '../../domain/entities/publishing-job.entity';
import { PublishingJobRepository } from '../../application/ports/publishing-job.repository';
import { PublishFromTemplateUseCase } from '../../application/use-cases/publish-from-template.use-case';
import { ManualPublishUseCase } from '../../application/use-cases/manual-publish.use-case';
import { PublishAuditLogService } from '../../application/services/publish-audit-log.service';
import { PublishRateLimitService } from '../../application/services/publish-rate-limit.service';
import {
  AuditQueryDto,
  ManualPublishDto,
  PublishFromTemplateDto,
  RecentQueryDto,
} from './dto/publishing.dto';

function toJson(job: PublishingJob): Record<string, unknown> {
  return {
    id: job.id,
    templateId: job.templateId,
    mentionId: job.mentionId,
    ticker: job.ticker,
    chain: job.chain,
    address: job.address,
    channelTarget: job.channelTarget,
    status: job.status,
    telegramMessageId: job.telegramMessageId,
    failedReason: job.failedReason,
    createdAt: job.createdAtDate.toISOString(),
    finalizedAt: job.finalizedAt?.toISOString() ?? null,
  };
}

/**
 * Publishing controller (Tramo 1, todo 11, Ph11 API; auth todo 23, P50).
 *
 * `POST /api/publishing/publish` (template-scoped, catalog bot) +
 * `POST /api/publishing/manual` (explicit bot + channel) +
 * `GET /api/publishing/recent|failed` + `GET /api/publishing/audit`
 * (who/what/where, no tokens). P14: no `vip-calls` route or module
 * exists — `vip-calls` is only a template NAME passed as `templateId`.
 *
 * P50: every route requires the API key guard (except `/api/health`, which lives
 * elsewhere); both POSTs are rate-limited and require the `x-owner-id`
 * binding matching the template owner (foreign bindings → 403 + audit).
 */
@Controller('api/publishing')
@UseGuards(ApiKeyGuard)
@UseFilters(DomainExceptionFilter)
export class PublishingController {
  public constructor(
    private readonly jobs: PublishingJobRepository,
    private readonly publishFromTemplate: PublishFromTemplateUseCase,
    private readonly manualPublish: ManualPublishUseCase,
    private readonly audit: PublishAuditLogService,
    private readonly limiter: PublishRateLimitService,
  ) {}

  @Post('publish')
  @HttpCode(201)
  public async publish(
    @Body() dto: PublishFromTemplateDto,
    @Headers(OWNER_ID_HEADER) ownerHeader?: string,
  ): Promise<Record<string, unknown>> {
    const ownerId = normalizeOwnerId(ownerHeader);
    this.limiter.checkOrThrow(`publish:${ownerId ?? 'anon'}:${dto.templateId}`);
    const out = await this.publishFromTemplate.execute({
      templateId: dto.templateId,
      mentionId: dto.mentionId,
      ticker: dto.ticker ?? null,
      chain: dto.chain,
      address: dto.address,
      marketCapUsd: dto.marketCapUsd,
      chart: dto.chart,
      requesterOwnerId: ownerId,
    });
    return {
      published: out.published,
      reason: out.reason,
      jobId: out.jobId,
      messageId: out.messageId,
      message: out.message,
    };
  }

  @Post('manual')
  @HttpCode(201)
  public async manual(
    @Body() dto: ManualPublishDto,
    @Headers(OWNER_ID_HEADER) ownerHeader?: string,
  ): Promise<Record<string, unknown>> {
    const ownerId = normalizeOwnerId(ownerHeader);
    this.limiter.checkOrThrow(
      `manual:${ownerId ?? 'anon'}:${dto.templateId ?? dto.botId}`,
    );
    const out = await this.manualPublish.execute({
      botId: dto.botId,
      channelTarget: dto.channelTarget,
      mentionId: dto.mentionId,
      templateId: dto.templateId,
      ticker: dto.ticker ?? null,
      chain: dto.chain,
      address: dto.address,
      marketCapUsd: dto.marketCapUsd,
      chart: dto.chart,
      requesterOwnerId: ownerId,
    });
    return { jobId: out.jobId, messageId: out.messageId, message: out.message };
  }

  @Get('recent')
  public async recent(
    @Query() query: RecentQueryDto,
  ): Promise<Record<string, unknown>> {
    const jobs = await this.jobs.findRecent(query.limit ?? 50);
    return { jobs: jobs.map(toJson) };
  }

  @Get('failed')
  public async failed(
    @Query() query: RecentQueryDto,
  ): Promise<Record<string, unknown>> {
    const jobs = await this.jobs.findFailed(query.limit ?? 50);
    return { jobs: jobs.map(toJson) };
  }

  @Get('audit')
  public async auditLog(
    @Query() query: AuditQueryDto,
  ): Promise<Record<string, unknown>> {
    return { entries: this.audit.findRecent(query.limit ?? 50) };
  }
}
