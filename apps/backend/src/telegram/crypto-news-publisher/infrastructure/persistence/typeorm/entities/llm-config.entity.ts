import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * TypeORM persistence shape for `LlmConfig`.
 *
 * Table: `crypto_news_publisher_llm_config` — single-row configuration
 * for crypto-news publishing. Always exactly one row; the domain
 * aggregate enforces `id = 1`, the migration service seeds it on
 * first boot, and `LlmConfigRepository.load()` throws if it's missing
 * (the migration is meant to be infallible).
 *
 * The id is a literal integer PK rather than a UUID because the
 * contract is "there is only one row" — a UUID would be a marketing
 * trick that buys nothing and breaks the simpler-on-the-eye
 * `WHERE id = 1` predicate that the migration uses to test for
 * existence.
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives
 * at `telegram/crypto-news-publisher/domain/entities/llm-config.entity.ts`
 * and owns invariants (positive numbers, integer hour, delayMin <
 * delayMax, non-empty defaultTemplateId). The mapper translates
 * between the two.
 */
@Entity({ name: 'crypto_news_publisher_llm_config' })
export class LlmConfigEntity {
  @PrimaryColumn({ name: 'id', type: 'integer' })
  public id!: number;

  @Column({ name: 'default_template_id', type: 'uuid' })
  public defaultTemplateId!: string;

  @Column({ name: 'target_channel', type: 'varchar', length: 64, default: '' })
  public targetChannel!: string;

  @Column({ name: 'matching_enabled', type: 'boolean', default: false })
  public matchingEnabled!: boolean;

  @Column({ name: 'llm_enabled', type: 'boolean', default: false })
  public llmEnabled!: boolean;

  @Column({ name: 'publishing_enabled', type: 'boolean', default: false })
  public publishingEnabled!: boolean;

  @Column({ name: 'reject_non_latin', type: 'boolean', default: true })
  public rejectNonLatin!: boolean;

  @Column({ name: 'daily_cap', type: 'integer' })
  public dailyCap!: number;

  @Column({ name: 'daily_reset_utc_hour', type: 'integer' })
  public dailyResetUtcHour!: number;

  @Column({ name: 'random_delay_min_ms', type: 'integer' })
  public randomDelayMinMs!: number;

  @Column({ name: 'random_delay_max_ms', type: 'integer' })
  public randomDelayMaxMs!: number;

  @Column({ name: 'llm_max_attempts', type: 'integer' })
  public llmMaxAttempts!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
