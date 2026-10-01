import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

/**
 * TypeORM persistence shape for contract posts (`scheduled_posts`,
 * todos 1-2). NOT wired into a module yet (GAP-1 pattern: live reads
 * use the in-memory adapter; wiring lands with the persistence
 * todo). Idempotency scope (sessionId + key) is a UNIQUE pair so a
 * replay can never double-insert even across restarts.
 */
@Entity('scheduled_posts')
@Index('uq_scheduled_posts_session_key', ['sessionId', 'idempotencyKey'], {
  unique: true,
})
@Index('ix_scheduled_posts_state', ['state'])
export class ScheduledPostOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  public id!: string;

  @Column({ type: 'varchar', length: 128 })
  public sessionId!: string;

  @Column({ type: 'jsonb' })
  public binding!: {
    target: string;
    bindingId: string;
    botId: string;
    chatId: string;
  };

  @Column({ type: 'jsonb' })
  public content!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  public scheduleKind!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 64 })
  public idempotencyKey!: string;

  @Column({ type: 'varchar', length: 16, default: 'scheduled' })
  public state!: string;

  @Column({ type: 'int', nullable: true })
  public messageId!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  public firedAt!: Date | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  public reason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  public lastFiredAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public updatedAt!: Date;
}
