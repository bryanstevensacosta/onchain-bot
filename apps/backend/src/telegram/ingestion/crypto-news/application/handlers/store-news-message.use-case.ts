import { Injectable, Logger } from '@nestjs/common';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageIngestedEvent } from 'telegram/ingestion/crypto-news/domain/events/crypto-news-message-ingested.event';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { ContentFilterService } from 'telegram/ingestion/crypto-news/application/services/content-filter.service';
import { CryptoNewsMedia } from 'telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo';

export interface StoreNewsMessageInput {
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly occurredAt: Date;
  /**
   * Optional photo attachments downloaded by the listener at ingestion
   * time. When undefined or empty, the message is stored with no media
   * (backward compatible with pre-T6 callers).
   */
  readonly media?: ReadonlyArray<CryptoNewsMedia>;
  /**
   * Optional text formatting entities from Telegram (bold, links, etc.)
   */
  readonly entities?: ReadonlyArray<{
    readonly offset: number;
    readonly length: number;
    readonly type: string;
    readonly url?: string;
  }>;
  readonly groupedId?: string | null;
}

/**
 * Use case: persist a Telegram message from a crypto-news source channel.
 *
 * The raw `content` is stored in the DB (so the dashboard can serve it).
 * However, the emitted domain event (`CryptoNewsMessageIngestedEvent`)
 * carries ONLY metadata (no `content`) — this is fix-1 Bot Dev ToS §4.3
 * compliance: raw content never crosses the event bus.
 *
 * Before persistence, message title and content are passed through
 * ContentFilterService using per-channel filter rules (if any).
 */
@Injectable()
export class StoreNewsMessageUseCase {
  private readonly logger = new Logger(StoreNewsMessageUseCase.name);

  constructor(
    private readonly messageRepo: CryptoNewsMessageRepository,
    private readonly eventPublisher: CryptoNewsEventPublisher,
    private readonly sourceRepo: CryptoNewsSourceRepository,
    private readonly contentFilter: ContentFilterService,
  ) {}

  public async execute(
    input: StoreNewsMessageInput,
  ): Promise<CryptoNewsMessage> {
    // Skip if the message already exists in the DB (e.g. listener
    // re-polled a message that was already ingested before a restart).
    // Without this guard, every duplicate key error is logged at ERROR
    // level, polluting the logs and confusing operators. It also
    // prevents a duplicate event from reaching the event bus (which
    // would re-trigger the publisher handler).
    const existing = await this.messageRepo.findByChannelAndMessageId(
      input.channelId,
      input.messageId,
    );
    if (existing) {
      this.logger.debug(
        `skip duplicate: ${input.channelId}:${input.messageId}`,
      );
      return existing;
    }

    // Fetch and apply content filters for this channel before persistence.
    const filters = await this.sourceRepo.findFiltersByChannelId(
      input.channelId,
    );
    const { title, content } = this.contentFilter.filterTitleAndContent(
      input.title,
      input.content,
      filters,
    );

    const message = CryptoNewsMessage.create({
      channelId: input.channelId,
      messageId: input.messageId,
      title,
      content,
      publishedAt: input.occurredAt,
      media: input.media,
      formattingEntities: input.entities
        ? JSON.stringify(input.entities)
        : null,
      groupedId: input.groupedId ?? null,
    });

    await this.messageRepo.save(message);

    await this.eventPublisher.publish(
      new CryptoNewsMessageIngestedEvent({
        channelId: input.channelId,
        messageId: input.messageId,
        title,
        occurredAt: input.occurredAt,
      }),
    );

    return message;
  }
}
