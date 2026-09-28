import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueuedArticleDispatcherPort } from '@/queue/application/ports/queued-article-dispatcher.port';
import type { PublisherQueueEntry } from '@/queue/domain/publisher-queue-entry.entity';
import { LlmConfigRepository } from '@/llm/domain/ports/llm-config.repository';
import {
  TargetDispatcherPort,
  type TargetDispatchInput,
} from '../ports/target-dispatcher.port';
import type { PublishTarget } from '@/target/domain/target-binding';

/**
 * LIVE `QueuedArticleDispatcherPort` binding via `target/`
 * (threads-publisher plan Fase 2 todo 10).
 *
 * Replaces the direct `TelegramQueuedArticleDispatcher` binding:
 * route by `entry.contentType` (`crypto-news` -> `telegram`,
 * `threads` -> `threads`) and deliver through `TargetDispatcherPort`
 * (gateway vault id for telegram, threads-publisher HTTP for
 * threads). Chat resolution is unchanged (DB `targetChannel` first,
 * env output channel fallback); the bot travels as the env local key
 * (`env:CRYPTO_NEWS_BOT_TOKEN` / `env:THREADS_BOT_TOKEN`) so the
 * gateway vault mapping keeps resolving pre-migration ids.
 *
 * Failure contract (matches the drain use-case): throws `Error`;
 * messages carrying `not configured` release the entry back to
 * PENDING without burning an attempt.
 */
@Injectable()
export class TargetQueuedArticleDispatcher extends QueuedArticleDispatcherPort {
  public constructor(
    private readonly config: ConfigService,
    @Optional() private readonly targets?: TargetDispatcherPort,
    @Optional()
    @Inject(LlmConfigRepository)
    private readonly llmConfigs?: LlmConfigRepository,
  ) {
    super();
  }

  public async dispatch(
    entry: PublisherQueueEntry,
    content: string,
  ): Promise<{ readonly telegramMessageId: string }> {
    if (!content) {
      throw new Error(
        'TargetQueuedArticleDispatcher: empty content (not configured?)',
      );
    }
    if (!this.targets) {
      throw new Error(
        'TargetQueuedArticleDispatcher: target dispatcher unwired (not configured)',
      );
    }
    const target = this.targetFor(entry.contentType);
    const chatId = await this.resolveChatId(entry.contentType);
    if (!chatId) {
      throw new Error(
        `TargetQueuedArticleDispatcher: no channel for ${entry.contentType} (not configured)`,
      );
    }
    const input: TargetDispatchInput = {
      target,
      botId:
        target === 'threads'
          ? 'env:THREADS_BOT_TOKEN'
          : 'env:CRYPTO_NEWS_BOT_TOKEN',
      chatId,
      content,
      mode: 'raw',
      clientMsgId: `queue:${entry.id}`,
    };
    const result = await this.targets.dispatch(input);
    if (!result.ok) {
      throw new Error(result.error);
    }
    return { telegramMessageId: result.remoteId };
  }

  private targetFor(contentType: string): PublishTarget {
    if (contentType === 'crypto-news') return 'telegram';
    if (contentType === 'threads') return 'threads';
    throw new Error(
      `TargetQueuedArticleDispatcher: unsupported content type ${contentType}`,
    );
  }

  private async resolveChatId(contentType: string): Promise<string> {
    try {
      const cfg = await this.llmConfigs?.load();
      const channel = cfg?.targetChannel?.trim() ?? '';
      if (channel) {
        return channel;
      }
    } catch {
      // Fail-open to the env default (same as the legacy dispatcher).
    }
    const envName =
      contentType === 'threads'
        ? 'THREADS_OUTPUT_CHANNEL'
        : 'CRYPTO_NEWS_OUTPUT_CHANNEL';
    return (this.config.get<string>(envName, '') ?? '').trim();
  }
}
