import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * TypeORM persistence shape for `ThreadsLlmConfig`.
 *
 * Table: `threads_llm_configs` — single-row configuration for threads
 * publishing. Always exactly one row; the domain aggregate enforces
 * `id = 1`.
 *
 * Unlike the crypto-news mirror, there is NO `target_channel` column
 * (Threads publishes to the single authenticated account) and NO
 * `matching_enabled` legacy column (matching lives in
 * `threads_matching_configs` from day one).
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives
 * at `threads/publisher/domain/entities/threads-llm-config.entity.ts`
 * and owns invariants. The mapper translates between the two.
 */
@Entity({ name: 'threads_llm_configs' })
export class ThreadsLlmConfigEntity {
  @PrimaryColumn({ name: 'id', type: 'integer' })
  public id!: number;

  @Column({ name: 'default_template_id', type: 'uuid' })
  public defaultTemplateId!: string;

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
