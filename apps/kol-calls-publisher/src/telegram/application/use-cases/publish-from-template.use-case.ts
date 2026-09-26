import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { DomainEvent } from '../../../shared/kernel/domain-event';
import { assertBindingOwner } from '../../../shared/guards/owner-binding';
import type {
  KolPublishMode,
  TelegramConfig,
} from '../../../shared/config/telegram.config';
import { PublishingJob } from '../../domain/entities/publishing-job.entity';
import { PublishingJobRepository } from '../ports/publishing-job.repository';
import { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';
import { BotTokenResolverPort } from '../../domain/ports/bot-token-resolver.port';
import { BotsGatewaySenderPort } from '../../domain/ports/bots-gateway-sender.port';
import { DualSendParityService } from '../services/dual-send-parity.service';
import { GatewayBotMappingService } from '../../infrastructure/gateway/gateway-bot-mapping.service';
import { VipMessageFormatter } from '../../infrastructure/formatters/vip-message-formatter';
import { CallApprovalRepository } from '../../../approval/application/ports/call-approval.repository';
import { TemplateRepository } from '../../../templates/domain/ports/template.repository';
import { PublishAuditLogService } from '../services/publish-audit-log.service';

export interface PublishFromTemplateInput {
  readonly templateId: string;
  readonly mentionId: string;
  readonly ticker: string | null;
  readonly chain: string;
  readonly address: string;
  readonly marketCapUsd?: number | null;
  readonly chart?: string | null;
  readonly kolId?: string;
  /**
   * Binding owner presented by the caller (x-owner-id). `undefined` =
   * internal direct call (no HTTP binding, check skipped); `null` = HTTP
   * call without a binding (FORBIDDEN); any other value must equal the
   * template owner or the publish is denied with 403 + audit.
   */
  readonly requesterOwnerId?: string | null;
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
 * Template-scoped publish (Tramo 1, todo 11, Ph11; ownership todo 23, P50;
 * gateway routing todo 4).
 *
 * DIRECT call (fix-1, no event bus): the template decides everything.
 * `canPublish()` false (inactive, no bot, no channel, unverified) →
 * dashboard-only `{ published: false, reason }` WITHOUT touching Telegram
 * (adversarial: missing token degrades the template, never the batch).
 * A REJECTED approval blocks with `NOT_APPROVED`. Null/blank tickers throw
 * VALIDATION pre-publisher. Unknown catalog bots throw UNAUTHORIZED (401,
 * no post attempted). A missing/foreign owner binding throws FORBIDDEN
 * (403) BEFORE any gate — and every outcome lands in the audit log.
 *
 * Publish path (`KOL_PUBLISH_MODE`): `direct` = legacy
 * `MultiBotPublisherAdapter` (deprecated); `dual` = both legs, compare via
 * `DualSendParityService`, return the direct leg; `gateway` = gateway vault
 * id only — the catalog token is never resolved (cutover).
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
    @Optional() private readonly audit?: PublishAuditLogService,
    @Optional() private readonly gateway?: BotsGatewaySenderPort,
    @Optional() private readonly parity?: DualSendParityService,
    @Optional() private readonly mapping?: GatewayBotMappingService,
    @Optional() private readonly config?: ConfigService,
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
    try {
      assertBindingOwner(template.ownerId, input.requesterOwnerId, template.id);
    } catch (err) {
      this.denied(input, template.channelTarget, (err as DomainError).message);
      throw err;
    }
    const actor = input.requesterOwnerId ?? 'internal';
    if (!template.active)
      return this.dashboardOnly(input, actor, 'TEMPLATE_INACTIVE');
    if (!input.ticker?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'ticker must be resolved before publishing (never null pre-publisher)',
        { templateId: template.id, mentionId: input.mentionId },
      );
    }
    if (!template.botId)
      return this.dashboardOnly(input, actor, 'BOT_NOT_CONFIGURED');
    if (!template.channelTarget)
      return this.dashboardOnly(input, actor, 'CHANNEL_NOT_CONFIGURED');
    if (!template.adminVerifiedAt)
      return this.dashboardOnly(input, actor, 'CHANNEL_NOT_VERIFIED');

    const approval = await this.approvals.findById(
      `${template.id}:${input.mentionId}`,
    );
    if (approval && approval.status === 'rejected') {
      return this.dashboardOnly(input, actor, 'NOT_APPROVED');
    }

    if (this.publishMode() === 'gateway') {
      return this.executeViaGateway(input, actor, {
        botId: template.botId,
        channelTarget: template.channelTarget,
      });
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
    if (this.publishMode() === 'dual') {
      await this.compareGatewayLeg(
        template.botId,
        template.channelTarget,
        message,
        job.id,
        result,
      );
    }
    if (result.ok) {
      job.markPublished(result.messageId);
    } else {
      job.markFailed(`sendMessage: ${result.error ?? 'unknown'}`);
    }
    await this.jobs.save(job);
    const events = job.commit();
    this.audit?.record({
      actor: input.requesterOwnerId ?? 'internal',
      action: 'publish',
      templateId: template.id,
      mentionId: input.mentionId,
      channelTarget: template.channelTarget,
      reason: result.ok ? null : (result.error ?? 'SEND_FAILED'),
    });
    return {
      published: result.ok,
      reason: result.ok ? null : (result.error ?? 'SEND_FAILED'),
      jobId: job.id,
      messageId: result.messageId,
      message,
      events,
    };
  }

  private publishMode(): KolPublishMode {
    try {
      return (
        this.config?.get<TelegramConfig>('telegram')?.botsGateway
          ?.publishMode ?? 'direct'
      );
    } catch {
      return 'direct';
    }
  }

  private async executeViaGateway(
    input: PublishFromTemplateInput,
    actor: string,
    target: { botId: string; channelTarget: string },
  ): Promise<PublishFromTemplateOutput> {
    const message = this.formatter.format({
      chain: input.chain,
      address: input.address,
      ticker: (input.ticker ?? '').trim(),
      marketCapUsd: input.marketCapUsd ?? null,
      chart: input.chart ?? null,
    });
    const job = PublishingJob.create({
      templateId: input.templateId,
      mentionId: input.mentionId,
      ticker: (input.ticker ?? '').trim(),
      chain: input.chain,
      address: input.address,
      channelTarget: target.channelTarget,
      message,
    });
    await this.jobs.save(job);
    const gatewayId =
      this.mapping?.resolveGatewayId(target.botId) ?? target.botId;
    const result = await this.tryGateway(
      gatewayId,
      target.channelTarget,
      message,
      job.id,
    );
    if (result.ok) {
      job.markPublished(result.messageId);
    } else {
      job.markFailed(`gateway: ${result.error ?? 'unknown'}`);
    }
    await this.jobs.save(job);
    const events = job.commit();
    this.audit?.record({
      actor,
      action: 'publish',
      templateId: input.templateId,
      mentionId: input.mentionId,
      channelTarget: target.channelTarget,
      reason: result.ok ? null : (result.error ?? 'SEND_FAILED'),
    });
    return {
      published: result.ok,
      reason: result.ok ? null : (result.error ?? 'SEND_FAILED'),
      jobId: job.id,
      messageId: result.messageId,
      message,
      events,
    };
  }

  private async tryGateway(
    gatewayId: string,
    chatId: string,
    text: string,
    clientMsgId: string,
  ): Promise<{ ok: boolean; messageId: number | null; error: string | null }> {
    if (!this.gateway) {
      return { ok: false, messageId: null, error: 'gateway client unwired' };
    }
    try {
      return await this.gateway.sendViaGateway({
        botId: gatewayId,
        chatId,
        text,
        clientMsgId,
      });
    } catch (err) {
      return {
        ok: false,
        messageId: null,
        error: err instanceof Error ? err.message : 'unknown error',
      };
    }
  }

  private async compareGatewayLeg(
    botId: string,
    chatId: string,
    text: string,
    clientMsgId: string,
    direct: { ok: boolean; messageId: number | null; error: string | null },
  ): Promise<void> {
    if (!this.gateway || !this.parity) return;
    const gatewayId = this.mapping?.resolveGatewayId(botId) ?? botId;
    const gateway = await this.tryGateway(gatewayId, chatId, text, clientMsgId);
    this.parity.record({
      botId,
      chatId,
      direct,
      gateway,
      chunks: Math.max(1, Math.ceil(text.length / 4096)),
    });
  }

  private dashboardOnly(
    input: PublishFromTemplateInput,
    actor: string,
    reason: string,
  ): PublishFromTemplateOutput {
    this.audit?.record({
      actor,
      action: 'blocked',
      templateId: input.templateId,
      mentionId: input.mentionId,
      reason,
    });
    return {
      published: false,
      reason,
      jobId: null,
      messageId: null,
      message: null,
      events: [],
    };
  }

  private denied(
    input: PublishFromTemplateInput,
    channelTarget: string | null,
    reason: string,
  ): void {
    this.audit?.record({
      actor: input.requesterOwnerId ?? 'anonymous',
      action: 'denied',
      templateId: input.templateId,
      mentionId: input.mentionId,
      channelTarget,
      reason,
    });
  }
}
