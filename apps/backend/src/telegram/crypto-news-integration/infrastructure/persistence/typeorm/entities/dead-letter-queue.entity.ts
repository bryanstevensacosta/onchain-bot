import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type {
  DeadLetterQueueEntryProps,
  DeadLetterStatus,
} from 'telegram/crypto-news-integration/domain/entities/dead-letter-queue-entry.entity';

/**
 * TypeORM persistence shape for `DeadLetterQueueEntry`.
 *
 * Table: `dead_letter_queue` — failed crypto-news messages captured for
 * MANUAL on-demand retry (no automatic retry by design). One row per
 * failed SSE/polling message; the operator re-enqueues via
 * `POST /crypto-news/dead-letter/:id/retry`.
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `telegram/crypto-news-integration/domain/entities/dead-letter-queue-entry.entity.ts`.
 *
 * FK-LESS BY DESIGN: `channel_id`/`message_id` are opaque content-snapshot
 * coordinates with no FK to any crypto-news table — those tables live ONLY
 * in ingestion-telegram's `<base>_ingestion` DB since the ownership split
 * of 2026-09-08. `failed_payload` is a JSON-string snapshot (text, never
 * bytes), mirroring the `formattingEntities` text-JSON convention of the
 * publisher queue.
 */
@Entity({ name: 'dead_letter_queue' })
@Index('idx_dead_letter_queue_status', ['status'])
@Index('idx_dead_letter_queue_failed_at', ['failedAt'])
export class DeadLetterQueueEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  public id!: string;

  @Column({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ name: 'message_id', type: 'integer' })
  public messageId!: number;

  @Column({ name: 'failure_reason', type: 'text' })
  public failureReason!: string;

  @Column({ name: 'failed_payload', type: 'text', nullable: true })
  public failedPayload!: string | null;

  @Column({ name: 'failed_at', type: 'timestamptz', default: () => 'NOW()' })
  public failedAt!: Date;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  public retryCount!: number;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'PENDING' })
  public status!: DeadLetterStatus;

  /** Round-trip helper for tests / debug. */
  public toProps(): DeadLetterQueueEntryProps {
    return {
      id: this.id,
      channelId: this.channelId,
      messageId: this.messageId,
      failureReason: this.failureReason,
      failedPayload: this.failedPayload,
      failedAt: this.failedAt,
      retryCount: this.retryCount ?? 0,
      status: this.status,
    };
  }
}
