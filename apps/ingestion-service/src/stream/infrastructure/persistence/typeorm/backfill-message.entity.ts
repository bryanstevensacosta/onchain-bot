import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * TypeORM entity for `backfill_messages` table.
 *
 * Persists broadcast events for 72-hour backfill window.
 * Ingestion-service writes events as they're broadcast, enabling
 * reconnecting backends to retrieve missed messages via timestamp query.
 *
 * Per Requirement 7.1: Backfill buffer retains messages for 72 hours
 * Per Requirement 7.2: Messages persisted to database for restart recovery
 */
@Entity({ name: 'backfill_messages' })
@Index('idx_backfill_timestamp', ['timestamp'])
export class BackfillMessageEntity {
  /**
   * Unique event identifier (UUID v4).
   * Matches BroadcastEvent.eventId for consistency.
   */
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 36 })
  public eventId!: string;

  /**
   * Unix timestamp in milliseconds when message was ingested.
   * Indexed for fast `WHERE timestamp > ?` queries during reconnection backfill.
   *
   * Per Requirement 7.3: Fast timestamp-based queries for backfill
   */
  @Column({ name: 'timestamp', type: 'bigint' })
  public timestamp!: number;

  /**
   * Source Telegram channel/user ID (e.g., "-1001234567890").
   * Included for observability and potential per-channel backfill.
   */
  @Column({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  /**
   * Telegram message ID within the channel.
   * Included for observability and deduplication.
   */
  @Column({ name: 'message_id', type: 'int' })
  public messageId!: number;

  /**
   * JSON-encoded BroadcastEvent payload.
   * Contains full message data (text, media URLs, entities, etc.).
   *
   * Stored as text for portability; deserialized by BackfillBufferService.
   * Per Requirement 7.4: Complete message data preserved for backfill
   */
  @Column({ name: 'payload', type: 'text' })
  public payload!: string;
}
