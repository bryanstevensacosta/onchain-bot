import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueuedArticleDispatcherPort } from '../../../queue/application/ports/queued-article-dispatcher.port';
import type { PublisherQueueEntry } from '../../../queue/domain/publisher-queue-entry.entity';
import { LlmConfigRepository } from '../../../llm/domain/ports/llm-config.repository';
import { TelegramPublisherRouter } from '../services/telegram-publisher-router.service';

/**
 * LIVE `QueuedArticleDispatcherPort` binding (Tramo 2, todo 7 — replaces
 * the in-memory recorder; the recorder remains as a test double only).
 *
 * Drain path: route by `entry.contentType` (crypto-news -> crypto bot,
 * threads -> threads bot) -> resolve the destination chat
 * (`LlmConfig.targetChannel` first, env output channel fallback) ->
 * pick the send shape (album -> sendMediaGroup, one image ->
 * sendPhoto, text-only -> sendMessage).
 *
 * Failure contract (matches the drain use-case + scheduling gate):
 * throws `Error` whose message carries the adapter reason. Missing
 * token/channel errors contain `not configured` + the token env name,
 * so `ProcessNextQueuedArticleUseCase` releases the entry back to
 * PENDING WITHOUT burning an attempt — a missing bot token must never
 * drain the queue into FAILED.
 */
@Injectable()
export class TelegramQueuedArticleDispatcher extends QueuedArticleDispatcherPort {
  public constructor(
    private readonly router: TelegramPublisherRouter,
    private readonly config: ConfigService,
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
        'TelegramQueuedArticleDispatcher: empty content (not configured?)',
      );
    }
    const adapter = this.router.forContentType(entry.contentType);
    const chatId = await this.resolveChatId(entry.contentType);
    const images = [...entry.imagePaths];
    const result =
      images.length > 1
        ? await adapter.sendMediaGroup(chatId, content, images)
        : images.length === 1
          ? await adapter.sendPhoto(
              chatId,
              content,
              images[0] as string,
              undefined,
            )
          : await adapter.sendMessage(chatId, content, undefined, undefined);
    if (!result.ok) {
      throw new Error(
        result.error ?? 'TelegramQueuedArticleDispatcher: publish failed',
      );
    }
    return { telegramMessageId: String(result.messageId ?? 'unknown') };
  }

  private async resolveChatId(contentType: string): Promise<string> {
    try {
      const cfg = await this.llmConfigs?.load();
      const channel = cfg?.targetChannel?.trim() ?? '';
      if (channel) {
        return channel;
      }
    } catch {
      // Fail-open to the env default: a config-store outage must not
      // block publishing when the env channel is set.
    }
    const envName =
      contentType === 'threads'
        ? 'THREADS_OUTPUT_CHANNEL'
        : 'CRYPTO_NEWS_OUTPUT_CHANNEL';
    return (this.config.get<string>(envName, '') ?? '').trim();
  }
}
