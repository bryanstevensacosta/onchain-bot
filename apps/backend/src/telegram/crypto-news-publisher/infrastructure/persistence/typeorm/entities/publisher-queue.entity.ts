import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type {
  PublisherQueueEntryProps,
  PublisherQueueStatus,
} from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';

/**
 * TypeORM persistence shape for `PublisherQueueEntry`.
 *
 * Table: `crypto_news_publisher_queue` — queue of crypto-news messages
 * awaiting publication to the output Telegram channel. Capped at 36
 * entries via INSERT + overflow DELETE inside a single transaction
 * (see `TypeOrmPublisherQueueRepository.enqueue()`).
 *
 * Composite uniqueness on `(channel_id, message_id)` to prevent the
 * same source message from being enqueued twice. The index on
 * `message_received_at` backs both the "newest first" overflow DELETE
 * (ORDER BY DESC) and the `findNextPending()` (ORDER BY ASC) paths —
 * Postgres scans an ASC B-tree in reverse direction, so the same
 * index serves both orderings.
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity.ts`.
 */
@Entity({ name: 'crypto_news_publisher_queue' })
@Index('idx_publisher_queue_message_received_at', ['messageReceivedAt'])
@Index('idx_publisher_queue_status', ['status'])
@Index('uq_publisher_queue_channel_message', ['channelId', 'messageId'], {
  unique: true,
})
export class PublisherQueueEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  public id!: string;

  @Column({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ name: 'message_id', type: 'integer' })
  public messageId!: number;

  @Column({ name: 'raw_content', type: 'text' })
  public rawContent!: string;

  @Column({ name: 'raw_title', type: 'varchar', length: 512, nullable: true })
  public rawTitle!: string | null;

  @Column({ name: 'image_path', type: 'text', nullable: true })
  public imagePath!: string | null;

  @Column({ name: 'grouped_id', type: 'varchar', length: 64, nullable: true })
  public groupedId!: string | null;

  @Column({ name: 'message_received_at', type: 'timestamptz' })
  public messageReceivedAt!: Date;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  public status!: PublisherQueueStatus;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  public publishedAt!: Date | null;

  @Column({ name: 'telegram_message_id', type: 'varchar', nullable: true })
  public telegramMessageId!: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  public lastError!: string | null;

  @Column({ name: 'attempts', type: 'integer', default: 0 })
  public attempts!: number;

  /** Round-trip helper for tests / debug. */
  public toProps(): PublisherQueueEntryProps {
    return {
      id: this.id,
      channelId: this.channelId,
      messageId: this.messageId,
      rawContent: this.rawContent,
      rawTitle: this.rawTitle,
      imagePath: this.imagePath,
      groupedId: this.groupedId,
      messageReceivedAt: this.messageReceivedAt,
      status: this.status,
      publishedAt: this.publishedAt,
      telegramMessageId: this.telegramMessageId,
      lastError: this.lastError,
      attempts: this.attempts,
    };
  }
}
