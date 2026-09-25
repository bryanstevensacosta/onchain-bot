import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { DomainEvent } from '../../../shared/kernel/domain-event';
import { PublishingJob } from '../../domain/entities/publishing-job.entity';
import { PublishingJobRepository } from '../ports/publishing-job.repository';
import { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';
import { BotTokenResolverPort } from '../../domain/ports/bot-token-resolver.port';
import { VipMessageFormatter } from '../../infrastructure/formatters/vip-message-formatter';
import { CallApprovalRepository } from '../../../approval/application/ports/call-approval.repository';
import { TemplateRepository } from '../../../templates/domain/ports/template.repository';

export interface PublishFromTemplateInput {
  readonly templateId: string;
  readonly mentionId: string;
  readonly ticker: string | null;
  readonly chain: string;
  readonly address: string;
  readonly marketCapUsd?: number | null;
  readonly chart?: string | null;
  readonly kolId?: string;
}

export interface PublishFromTemplateOutput {
  readonly published: boolean;
  /** Dashboard-only reason when published === false (no Telegram call made). */
  readonly reason: string | null;
  readonly jobId: string | null;
  readonly messageId: number | null;
  readonly message: string | null;
  readonly events: DomainEvent[];
}

/**
 * Template-scoped publish (Tramo 1, todo 11, Ph11).
 *
 * DIRECT call (fix-1, no event bus): the template decides everything.
 * `canPublish()` false (inactive, no bot, no channel, unverified) →
 * dashboard-only `{ published: false, reason }` WITHOUT touching Telegram
 * (adversarial: missing token degrades the template, never the batch).
 * A REJECTED approval blocks with `NOT_APPROVED`. Null/blank tickers throw
 * VALIDATION pre-publisher. Unknown catalog bots throw UNAUTHORIZED (401,
 * no post attempted).
 */
@Injectable()
export class PublishFromTemplateUseCase {
  public constructor(
    private readonly jobs: PublishingJobRepository,
    private readonly approvals: CallApprovalRepository,
    private readonly templates: TemplateRepository,
    private readonly tokens: BotTokenResolverPort,
    private readonly publisher: TelegramPublisherPort,
    private readonly formatter: VipMessageFormatter,
  ) {}

  public async execute(
    input: PublishFromTemplateInput,
  ): Promise<PublishFromTemplateOutput> {
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
    if (!template.active) return this.dashboardOnly('TEMPLATE_INACTIVE');
    if (!input.ticker?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'ticker must be resolved before publishing (never null pre-publisher)',
        { templateId: template.id, mentionId: input.mentionId },
      );
    }
    if (!template.botId) return this.dashboardOnly('BOT_NOT_CONFIGURED');
    if (!template.channelTarget)
      return this.dashboardOnly('CHANNEL_NOT_CONFIGURED');
    if (!template.adminVerifiedAt)
      return this.dashboardOnly('CHANNEL_NOT_VERIFIED');

    const approval = await this.approvals.findById(
      `${template.id}:${input.mentionId}`,
    );
    if (approval && approval.status === 'rejected') {
      return this.dashboardOnly('NOT_APPROVED');
    }

    // UNAUTHORIZED propagates (401, no post attempted) — fail-closed.
    const botToken = await this.tokens.resolveBotToken(template.botId);
    const message = this.formatter.format({
      chain: input.chain,
      address: input.address,
      ticker: input.ticker.trim(),
      marketCapUsd: input.marketCapUsd ?? null,
      chart: input.chart ?? null,
    });

    const job = PublishingJob.create({
      templateId: template.id,
      mentionId: input.mentionId,
      ticker: input.ticker.trim(),
      chain: input.chain,
      address: input.address,
      channelTarget: template.channelTarget,
      message,
    });
    await this.jobs.save(job);

    const result = await this.publisher.sendMessage({
      botToken,
      chatId: template.channelTarget,
      text: message,
    });
    if (result.ok) {
      job.markPublished(result.messageId);
    } else {
      job.markFailed(`sendMessage: ${result.error ?? 'unknown'}`);
    }
    await this.jobs.save(job);
    const events = job.commit();
    return {
      published: result.ok,
      reason: result.ok ? null : (result.error ?? 'SEND_FAILED'),
      jobId: job.id,
      messageId: result.messageId,
      message,
      events,
    };
  }

  private dashboardOnly(reason: string): PublishFromTemplateOutput {
    return {
      published: false,
      reason,
      jobId: null,
      messageId: null,
      message: null,
      events: [],
    };
  }
}
