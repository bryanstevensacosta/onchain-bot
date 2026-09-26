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
import { TemplateRepository } from '../../../templates/domain/ports/template.repository';
import { PublishAuditLogService } from '../services/publish-audit-log.service';

export interface ManualPublishInput {
  readonly botId: string;
  readonly channelTarget: string;
  readonly mentionId?: string;
  readonly templateId?: string;
  readonly ticker: string | null;
  readonly chain: string;
  readonly address: string;
  readonly marketCapUsd?: number | null;
  readonly chart?: string | null;
  readonly requesterOwnerId?: string | null;
}

export interface ManualPublishOutput {
  readonly jobId: string;
  readonly messageId: number | null;
  readonly message: string;
  readonly events: DomainEvent[];
}

/**
 * Manual publish with an explicit catalog bot + channel (ops escape hatch).
 * Same guards as the template path: null ticker → VALIDATION, unknown bot
 * → UNAUTHORIZED (401, no post attempted). The job records
 * `templateId ?? 'manual'` for provenance. When a templateId is given and
 * the template exists, the owner binding is enforced (todo 23, P50);
 * every outcome lands in the audit log.
 *
 * Gateway routing (gateway todo 4): `KOL_PUBLISH_MODE=gateway` sends via
 * the gateway vault id only — the catalog token is never resolved.
 */
@Injectable()
export class ManualPublishUseCase {
  public constructor(
    private readonly jobs: PublishingJobRepository,
    private readonly tokens: BotTokenResolverPort,
    private readonly publisher: TelegramPublisherPort,
    private readonly formatter: VipMessageFormatter,
    @Optional() private readonly templates?: TemplateRepository,
    @Optional() private readonly audit?: PublishAuditLogService,
    @Optional() private readonly gateway?: BotsGatewaySenderPort,
    @Optional() private readonly parity?: DualSendParityService,
    @Optional() private readonly mapping?: GatewayBotMappingService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  public async execute(
    input: ManualPublishInput,
  ): Promise<ManualPublishOutput> {
    if (input.templateId && this.templates) {
      const template = await this.templates.findById(input.templateId);
      if (template) {
        try {
          assertBindingOwner(
            template.ownerId,
            input.requesterOwnerId,
            template.id,
          );
        } catch (err) {
          this.audit?.record({
            actor: input.requesterOwnerId ?? 'anonymous',
            action: 'denied',
            templateId: template.id,
            mentionId: input.mentionId,
            channelTarget: input.channelTarget,
            reason: (err as DomainError).message,
          });
          throw err;
        }
      }
    }
    if (!input.ticker?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'ticker must be resolved before publishing (never null pre-publisher)',
        { botId: input.botId },
      );
    }
    if (!input.channelTarget?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'channelTarget must not be empty',
        { botId: input.botId },
      );
    }
    if (this.publishMode() === 'gateway') {
      return this.executeViaGateway(input);
    }
    const botToken = await this.tokens.resolveBotToken(input.botId);
    const message = this.formatter.format({
      chain: input.chain,
      address: input.address,
      ticker: input.ticker.trim(),
      marketCapUsd: input.marketCapUsd ?? null,
      chart: input.chart ?? null,
    });
    const job = PublishingJob.create({
      templateId: input.templateId ?? 'manual',
      mentionId: input.mentionId ?? `${input.chain}:${input.address}`,
      ticker: input.ticker.trim(),
      chain: input.chain,
      address: input.address,
      channelTarget: input.channelTarget,
      message,
    });
    await this.jobs.save(job);
    const result = await this.publisher.sendMessage({
      botToken,
      chatId: input.channelTarget,
      text: message,
    });
    if (this.publishMode() === 'dual') {
      await this.compareGatewayLeg(
        input.botId,
        input.channelTarget,
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
    this.audit?.record({
      actor: input.requesterOwnerId ?? 'internal',
      action: 'manual',
      templateId: input.templateId ?? 'manual',
      mentionId: input.mentionId ?? `${input.chain}:${input.address}`,
      channelTarget: input.channelTarget,
      reason: result.ok ? null : (result.error ?? 'SEND_FAILED'),
    });
    return {
      jobId: job.id,
      messageId: result.messageId,
      message,
      events: job.commit(),
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

  private async compareGatewayLeg(
    botId: string,
    chatId: string,
    text: string,
    clientMsgId: string,
    direct: { ok: boolean; messageId: number | null; error: string | null },
  ): Promise<void> {
    if (!this.gateway || !this.parity) return;
    const gatewayId = this.mapping?.resolveGatewayId(botId) ?? botId;
    let gateway: {
      ok: boolean;
      messageId: number | null;
      error: string | null;
    };
    try {
      gateway = await this.gateway.sendViaGateway({
        botId: gatewayId,
        chatId,
        text,
        clientMsgId,
      });
    } catch (err) {
      gateway = {
        ok: false,
        messageId: null,
        error: err instanceof Error ? err.message : 'unknown error',
      };
    }
    this.parity.record({
      botId,
      chatId,
      direct,
      gateway,
      chunks: Math.max(1, Math.ceil(text.length / 4096)),
    });
  }

  private async executeViaGateway(
    input: ManualPublishInput,
  ): Promise<ManualPublishOutput> {
    const message = this.formatter.format({
      chain: input.chain,
      address: input.address,
      ticker: (input.ticker ?? '').trim(),
      marketCapUsd: input.marketCapUsd ?? null,
      chart: input.chart ?? null,
    });
    const job = PublishingJob.create({
      templateId: input.templateId ?? 'manual',
      mentionId: input.mentionId ?? `${input.chain}:${input.address}`,
      ticker: (input.ticker ?? '').trim(),
      chain: input.chain,
      address: input.address,
      channelTarget: input.channelTarget,
      message,
    });
    await this.jobs.save(job);
    const gatewayId =
      this.mapping?.resolveGatewayId(input.botId) ?? input.botId;
    let result: {
      ok: boolean;
      messageId: number | null;
      error: string | null;
    };
    try {
      if (!this.gateway) {
        result = {
          ok: false,
          messageId: null,
          error: 'gateway client unwired',
        };
      } else {
        result = await this.gateway.sendViaGateway({
          botId: gatewayId,
          chatId: input.channelTarget,
          text: message,
          clientMsgId: job.id,
        });
      }
    } catch (err) {
      result = {
        ok: false,
        messageId: null,
        error: err instanceof Error ? err.message : 'unknown error',
      };
    }
    if (result.ok) {
      job.markPublished(result.messageId);
    } else {
      job.markFailed(`gateway: ${result.error ?? 'unknown'}`);
    }
    await this.jobs.save(job);
    this.audit?.record({
      actor: input.requesterOwnerId ?? 'internal',
      action: 'manual',
      templateId: input.templateId ?? 'manual',
      mentionId: input.mentionId ?? `${input.chain}:${input.address}`,
      channelTarget: input.channelTarget,
      reason: result.ok ? null : (result.error ?? 'SEND_FAILED'),
    });
    return {
      jobId: job.id,
      messageId: result.messageId,
      message,
      events: job.commit(),
    };
  }
}
