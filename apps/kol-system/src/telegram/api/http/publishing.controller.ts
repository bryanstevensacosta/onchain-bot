import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { DomainExceptionFilter } from '../../../shared/filters/domain-exception.filter';
import type { PublishingJob } from '../../domain/entities/publishing-job.entity';
import { PublishingJobRepository } from '../../application/ports/publishing-job.repository';
import { PublishFromTemplateUseCase } from '../../application/use-cases/publish-from-template.use-case';
import { ManualPublishUseCase } from '../../application/use-cases/manual-publish.use-case';
import {
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
 * Publishing controller (Tramo 1, todo 11, Ph11 API).
 *
 * `POST /api/publishing/publish` (template-scoped, catalog bot) +
 * `POST /api/publishing/manual` (explicit bot + channel) +
 * `GET /api/publishing/recent|failed`. P14: no `vip-calls` route or module
 * exists — `vip-calls` is only a template NAME passed as `templateId`.
 */
@Controller('api/publishing')
@UseFilters(DomainExceptionFilter)
export class PublishingController {
  public constructor(
    private readonly jobs: PublishingJobRepository,
    private readonly publishFromTemplate: PublishFromTemplateUseCase,
    private readonly manualPublish: ManualPublishUseCase,
  ) {}

  @Post('publish')
  @HttpCode(201)
  public async publish(
    @Body() dto: PublishFromTemplateDto,
  ): Promise<Record<string, unknown>> {
    const out = await this.publishFromTemplate.execute({
      templateId: dto.templateId,
      mentionId: dto.mentionId,
      ticker: dto.ticker ?? null,
      chain: dto.chain,
      address: dto.address,
      marketCapUsd: dto.marketCapUsd,
      chart: dto.chart,
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
  ): Promise<Record<string, unknown>> {
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
}
