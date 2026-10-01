import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

/**
 * TypeORM persistence shape for `PublisherQueueEntry`.
 * NOT wired into a module yet (GAP-1); live reads use the in-memory
 * adapter. Table carries the `contentType` discriminator from day one so
 * threads rows (todo 8) land in the same table. FK-less by design.
 */
@Entity('feed_publisher_queue')
@Index('idx_cp_queue_status_queued', ['status', 'queuedAt'])
@Index('idx_cp_queue_channel_message', ['channelId', 'messageId'])
export class PublisherQueueOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  public id!: string;

  @Column({ type: 'varchar', length: 32 })
  public contentType!: string;

  @Column({ type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ type: 'int' })
  public messageId!: number;

  @Column({ type: 'text' })
  public rawContent!: string;

  @Column({ type: 'text', nullable: true })
  public rawTitle!: string | null;

  @Column({ type: 'simple-array', nullable: true })
  public imagePaths!: string[] | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  public groupedId!: string | null;

  @Column({ type: 'timestamptz' })
  public messageReceivedAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public queuedAt!: Date;

  @Column({ type: 'simple-array', nullable: true })
  public matchedKeywordIds!: string[] | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  public keywordTemplateId!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  public status!: string;

  @Column({ type: 'int', default: 0 })
  public attempts!: number;

  @Column({ type: 'timestamptz', nullable: true })
  public publishedAt!: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  public telegramMessageId!: string | null;

  @Column({ type: 'text', nullable: true })
  public generatedContent!: string | null;

  @Column({ type: 'text', nullable: true })
  public lastError!: string | null;

  @Column({ type: 'text', nullable: true })
  public blockedReason!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  public duplicateOfChannelId!: string | null;

  @Column({ type: 'int', nullable: true })
  public duplicateOfMessageId!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  public duplicateOfEntryId!: string | null;
}
