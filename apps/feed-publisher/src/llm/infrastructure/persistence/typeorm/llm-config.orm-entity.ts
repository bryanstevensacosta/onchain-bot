import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * TypeORM persistence shape for the single-row `LlmConfig` (`id = 1`).
 * NOT wired into a module yet (GAP-1); live reads use the in-memory
 * adapter.
 */
@Entity('feed_llm_config')
export class LlmConfigOrmEntity {
  @PrimaryColumn({ type: 'int' })
  public id!: number;

  @Column({ type: 'varchar', length: 128 })
  public defaultTemplateId!: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  public targetChannel!: string;

  @Column({ type: 'boolean', default: false })
  public llmEnabled!: boolean;

  @Column({ type: 'boolean', default: false })
  public publishingEnabled!: boolean;

  @Column({ type: 'boolean', default: true })
  public rejectNonLatin!: boolean;

  @Column({ type: 'int', default: 36 })
  public dailyCap!: number;

  @Column({ type: 'int', default: 0 })
  public dailyResetUtcHour!: number;

  @Column({ type: 'bigint', default: 1000 })
  public randomDelayMinMs!: number;

  @Column({ type: 'bigint', default: 5000 })
  public randomDelayMaxMs!: number;

  @Column({ type: 'int', default: 3 })
  public llmMaxAttempts!: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public updatedAt!: Date;
}
