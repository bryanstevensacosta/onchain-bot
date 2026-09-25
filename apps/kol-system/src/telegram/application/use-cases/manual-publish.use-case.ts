import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { DomainEvent } from '../../../shared/kernel/domain-event';
import { PublishingJob } from '../../domain/entities/publishing-job.entity';
import { PublishingJobRepository } from '../ports/publishing-job.repository';
import { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';
import { BotTokenResolverPort } from '../../domain/ports/bot-token-resolver.port';
import { VipMessageFormatter } from '../../infrastructure/formatters/vip-message-formatter';

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
 * `templateId ?? 'manual'` for provenance.
 */
@Injectable()
export class ManualPublishUseCase {
  public constructor(
    private readonly jobs: PublishingJobRepository,
    private readonly tokens: BotTokenResolverPort,
    private readonly publisher: TelegramPublisherPort,
    private readonly formatter: VipMessageFormatter,
  ) {}

  public async execute(
    input: ManualPublishInput,
  ): Promise<ManualPublishOutput> {
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
    if (result.ok) {
      job.markPublished(result.messageId);
    } else {
      job.markFailed(`sendMessage: ${result.error ?? 'unknown'}`);
    }
    await this.jobs.save(job);
    return {
      jobId: job.id,
      messageId: result.messageId,
      message,
      events: job.commit(),
    };
  }
}
