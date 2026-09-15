import * as crypto from 'node:crypto';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type {
  ThreadsQueueEntryProps,
  ThreadsQueueStatus,
} from 'threads/publisher/domain/entities/threads-queue-entry.entity';

/**
 * TypeORM persistence shape for `ThreadsQueueEntry`.
 *
 * Table: `threads_queue_entries` — queue of messages awaiting
 * publication to Threads. Capped at 100 entries via INSERT + overflow
 * DELETE inside a single transaction (see `THREADS_MAX_QUEUE_DEPTH`,
 * T2).
 *
 * Composite uniqueness on `(channel_id, message_id)` to prevent the
 * same source message from being enqueued twice. The index on
 * `message_received_at` backs both the "newest first" overflow DELETE
 * (ORDER BY DESC) and the `findNextPending()` (ORDER BY ASC) paths —
 * Postgres scans an ASC B-tree in reverse direction, so the same
 * index serves both orderings. The partial index on `queued_at`
 * WHERE status='PENDING' backs the 24h TTL expiration query.
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `threads/publisher/domain/entities/threads-queue-entry.entity.ts`.
 */
@Entity({ name: 'threads_queue_entries' })
@Index('idx_threads_queue_message_received_at', ['messageReceivedAt'])
@Index('idx_threads_queue_status', ['status'])
@Index('idx_threads_queue_keyword_template_id', ['keywordTemplateId'])
@Index('idx_threads_queue_pending', ['queuedAt'], {
  where: `"status" = 'PENDING'`,
})
@Index('uq_threads_queue_channel_message', ['channelId', 'messageId'], {
  unique: true,
})
export class ThreadsQueueEntryEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  public id!: string;

  @Column({ name: 'trace_id', type: 'uuid', nullable: true })
  public traceId!: string | null;

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

  @Column({
    name: 'image_paths',
    type: 'text',
    array: true,
    nullable: true,
    default: '{}',
  })
  public imagePaths!: string[];

  @Column({ name: 'grouped_id', type: 'varchar', length: 64, nullable: true })
  public groupedId!: string | null;

  @Column({ name: 'message_received_at', type: 'timestamptz' })
  public messageReceivedAt!: Date;

  /**
   * Timestamp when this entry was added to the queue. Used for TTL
   * expiration: entries older than 24h in PENDING status are
   * automatically marked FAILED by the stale-entry janitor.
   * Default NOW() set by migration.
   */
  @Column({ name: 'queued_at', type: 'timestamptz', default: () => 'NOW()' })
  public queuedAt!: Date;

  @Column({
    name: 'matched_keyword_ids',
    type: 'text',
    array: true,
    nullable: true,
    default: '{}',
  })
  public matchedKeywordIds!: string[];

  /**
   * Frozen at enqueue time. Null means "no per-keyword override" —
   * the LLM adapter falls back to `ThreadsLlmConfig.defaultTemplateId`.
   */
  @Column({ name: 'keyword_template_id', type: 'uuid', nullable: true })
  public keywordTemplateId!: string | null;

  @Column({ name: 'formatting_entities', type: 'text', nullable: true })
  public formattingEntities!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  public status!: ThreadsQueueStatus;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  public publishedAt!: Date | null;

  @Column({ name: 'telegram_message_id', type: 'varchar', nullable: true })
  public telegramMessageId!: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  public lastError!: string | null;

  @Column({ name: 'attempts', type: 'integer', default: 0 })
  public attempts!: number;

  @Column({ name: 'generated_content', type: 'text', nullable: true })
  public generatedContent!: string | null;

  @Column({ name: 'generated_system_prompt', type: 'text', nullable: true })
  public generatedSystemPrompt!: string | null;

  @Column({ name: 'generated_user_prompt', type: 'text', nullable: true })
  public generatedUserPrompt!: string | null;

  @Column({ name: 'generated_temperature', type: 'real', nullable: true })
  public generatedTemperature!: number | null;

  @Column({
    name: 'generated_reasoning_effort',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  public generatedReasoningEffort!: string | null;

  @Column({
    name: 'generated_model',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  public generatedModel!: string | null;

  @Column({ name: 'blocked_reason', type: 'text', nullable: true })
  public blockedReason!: string | null;

  @Column({
    name: 'duplicate_of_channel_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  public duplicateOfChannelId!: string | null;

  @Column({ name: 'duplicate_of_message_id', type: 'integer', nullable: true })
  public duplicateOfMessageId!: number | null;

  @Column({ name: 'duplicate_of_entry_id', type: 'uuid', nullable: true })
  public duplicateOfEntryId!: string | null;

  /** Round-trip helper for tests / debug. */
  public toProps(): ThreadsQueueEntryProps {
    return {
      id: this.id,
      traceId: this.traceId ?? crypto.randomUUID(),
      channelId: this.channelId,
      messageId: this.messageId,
      rawContent: this.rawContent,
      rawTitle: this.rawTitle,
      imagePath: this.imagePath,
      imagePaths: this.imagePaths ?? [],
      groupedId: this.groupedId,
      messageReceivedAt: this.messageReceivedAt,
      queuedAt: this.queuedAt,
      matchedKeywordIds: this.matchedKeywordIds ?? [],
      keywordTemplateId: this.keywordTemplateId,
      formattingEntities: this.formattingEntities,
      status: this.status,
      publishedAt: this.publishedAt,
      telegramMessageId: this.telegramMessageId,
      lastError: this.lastError,
      attempts: this.attempts,
      generatedContent: this.generatedContent,
      generatedSystemPrompt: this.generatedSystemPrompt,
      generatedUserPrompt: this.generatedUserPrompt,
      generatedTemperature: this.generatedTemperature,
      generatedReasoningEffort: this.generatedReasoningEffort,
      generatedModel: this.generatedModel,
      blockedReason: this.blockedReason,
      duplicateOfChannelId: this.duplicateOfChannelId,
      duplicateOfMessageId: this.duplicateOfMessageId,
      duplicateOfEntryId: this.duplicateOfEntryId,
    };
  }
}
