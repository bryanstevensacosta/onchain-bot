import { Injectable } from '@nestjs/common';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageIngestedEvent } from 'telegram/ingestion/crypto-news/domain/events/crypto-news-message-ingested.event';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';
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
}

/**
 * Use case: persist a Telegram message from a crypto-news source channel.
 *
 * The raw `content` is stored in the DB (so the dashboard can serve it).
 * However, the emitted domain event (`CryptoNewsMessageIngestedEvent`)
 * carries ONLY metadata (no `content`) — this is fix-1 Bot Dev ToS §4.3
 * compliance: raw content never crosses the event bus.
 */
@Injectable()
export class StoreNewsMessageUseCase {
  constructor(
    private readonly messageRepo: CryptoNewsMessageRepository,
    private readonly eventPublisher: CryptoNewsEventPublisher,
  ) {}

  public async execute(
    input: StoreNewsMessageInput,
  ): Promise<CryptoNewsMessage> {
    const message = CryptoNewsMessage.create({
      channelId: input.channelId,
      messageId: input.messageId,
      title: input.title,
      content: input.content,
      publishedAt: input.occurredAt,
      media: input.media,
    });

    await this.messageRepo.save(message);

    await this.eventPublisher.publish(
      new CryptoNewsMessageIngestedEvent({
        channelId: input.channelId,
        messageId: input.messageId,
        title: input.title,
        occurredAt: input.occurredAt,
      }),
    );

    return message;
  }
}
