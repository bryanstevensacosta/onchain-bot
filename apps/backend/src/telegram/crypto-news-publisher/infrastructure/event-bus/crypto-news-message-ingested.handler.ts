import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CryptoNewsMessageIngestedEvent } from 'telegram/ingestion/crypto-news/domain/events/crypto-news-message-ingested.event';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';
import { EnqueueMatchingMessageUseCase } from 'telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';

/**
 * Event handler: reacts to ingested crypto-news messages.
 *
 * Listens to `CryptoNewsMessageIngestedEvent` and tests the message content
 * against enabled keywords. On a match, enqueues the message for publication.
 *
 * Per fix-1 (Bot Dev ToS §4.3 compliance): this handler must NOT log raw
 * `content`. Only channelId, messageId, and title (from the event) are logged.
 * The full message is fetched via `findByChannelAndMessageId` only to test
 * keyword matching — content does not cross the event bus.
 */
@Injectable()
export class CryptoNewsMessageIngestedHandler {
  private readonly logger = new Logger(CryptoNewsMessageIngestedHandler.name);

  /**
   * Cache TTL for enabled keywords. Avoids DB hit on every ingested message.
   */
  private static readonly KEYWORD_CACHE_TTL_MS = 10_000;

  /**
   * Cached enabled keywords, refreshed after KEYWORD_CACHE_TTL_MS.
   */
  private cachedKeywords: readonly Keyword[] = [];
  private cacheTimestamp: number = 0;

  public constructor(
    private readonly messageRepo: CryptoNewsMessageRepository,
    private readonly keywordRepo: KeywordRepository,
    private readonly enqueue: EnqueueMatchingMessageUseCase,
  ) {}

  /**
   * Handle incoming crypto-news message.
   *
   * Flow:
   *  1. Fetch full message (with content) via repository lookup
   *  2. Get enabled keywords (cached with 10s TTL)
   *  3. Test keyword.matches() against message content
   *  4. On match, enqueue via use case
   *  5. Log result (without leaking content)
   */
  @OnEvent('CryptoNewsMessageIngestedEvent', { async: true })
  async handle(event: CryptoNewsMessageIngestedEvent): Promise<void> {
    const { channelId, messageId, title } = event.payload;

    try {
      // Fetch full message for keyword matching (event only carries metadata)
      const message = await this.messageRepo.findByChannelAndMessageId(
        channelId,
        messageId,
      );

      if (!message) {
        this.logger.warn(
          `Message not found: channelId=${channelId}, messageId=${messageId}`,
        );
        return;
      }

      // Get enabled keywords (cached)
      const keywords = await this.getEnabledKeywords();

      // Test each keyword against content
      const matchedKeyword = keywords.find((kw) => kw.matches(message.content));

      if (!matchedKeyword) {
        this.logger.debug(
          `No keyword matched: channelId=${channelId}, messageId=${messageId}, title=${title ?? '(none)'}`,
        );
        return;
      }

      // Enqueue the matched message
      const entry = await this.enqueue.execute({ message });

      this.logger.log(
        `Keyword matched and enqueued: channelId=${channelId}, messageId=${messageId}, title=${title ?? '(none)'}, keyword="${matchedKeyword.phrase}", queueId=${entry.id}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to process crypto-news message: channelId=${channelId}, messageId=${messageId}, title=${title ?? '(none)'}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Fail open: don't re-throw. A failed match shouldn't block the pipeline.
    }
  }

  /**
   * Get enabled keywords, using a simple TTL cache.
   */
  private async getEnabledKeywords(): Promise<readonly Keyword[]> {
    const now = Date.now();

    if (
      this.cachedKeywords.length === 0 ||
      now - this.cacheTimestamp >
        CryptoNewsMessageIngestedHandler.KEYWORD_CACHE_TTL_MS
    ) {
      this.cachedKeywords = await this.keywordRepo.findEnabled();
      this.cacheTimestamp = now;
      this.logger.debug(
        `Refreshed keyword cache: ${this.cachedKeywords.length} enabled keywords`,
      );
    }

    return this.cachedKeywords;
  }
}
