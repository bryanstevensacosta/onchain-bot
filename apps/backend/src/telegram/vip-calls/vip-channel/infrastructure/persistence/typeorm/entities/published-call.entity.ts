import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'published_calls' })
@Index('idx_published_calls_status', ['status'])
@Index('idx_published_calls_published_at', ['publishedAt'])
export class PublishedCallEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  public id!: string;

  @Column({ name: 'chain', type: 'varchar', length: 32 })
  public chain!: string;

  @Column({ name: 'address', type: 'varchar' })
  public address!: string;

  @Column({ name: 'ticker', type: 'varchar', length: 32, nullable: true })
  public ticker!: string | null;

  @Column({ name: 'score', type: 'int' })
  public score!: number;

  @Column({ name: 'tier', type: 'varchar', length: 32 })
  public tier!: string;

  @Column({ name: 'classification', type: 'varchar', length: 64 })
  public classification!: string;

  @Column({ name: 'message', type: 'text' })
  public message!: string;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  public status!: string;

  @Column({ name: 'published_channel_ids', type: 'jsonb', nullable: true })
  public publishedChannelIds!: ReadonlyArray<string>;

  @Column({ name: 'failed_channel_ids', type: 'jsonb', nullable: true })
  public failedChannelIds!: ReadonlyArray<string>;

  @CreateDateColumn({ name: 'published_at', type: 'timestamptz' })
  public publishedAt!: Date;

  @Column({ name: 'mc_at_call', type: 'numeric', nullable: true })
  public mcAtCall!: number | null;

  /**
   * Telegram-side `message_id` from the Bot API sendMessage response.
   *
   * `null` until the publish sequence transitions RESERVED → PUBLISHED.
   * A non-null value here means Telegram acknowledged the message and
   * returned its permanent id.
   *
   * UNIQUE partial index enforced by the migration at
   * `scripts/backfills/2026-07-01-published-calls-telegram-msg-unique.sql`.
   * The @Index decorator was deliberately omitted so `synchronize: true`
   * does not create a competing non-unique index.
   */
  @Column({ name: 'telegram_message_id', type: 'bigint', nullable: true })
  public telegramMessageId!: number | null;

  @Column({ name: 'reserved_at', type: 'timestamptz', nullable: true })
  public reservedAt!: Date | null;

  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  public correlationId!: string | null;

  @Column({ name: 'failed_reason', type: 'text', nullable: true })
  public failedReason!: string | null;
}
