import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

/**
 * TypeORM persistence shape for `ThreadMessage`.
 * NOT wired into a module yet (GAP-1). FK-less by design: rows point
 * at `feed_threads` via the `threadId` column, never a database FK
 * (same pattern as the unified queue).
 */
@Entity('feed_thread_messages')
@Index('idx_fp_thread_messages_thread', ['threadId', 'idx'])
export class ThreadMessageOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  public id!: string;

  @Column({ type: 'varchar', length: 255 })
  public threadId!: string;

  @Column({ type: 'int' })
  public idx!: number;

  @Column({ type: 'text' })
  public content!: string;

  @Column({ type: 'simple-array', nullable: true })
  public mediaUrls!: string[] | null;

  @Column({ type: 'int', default: 0 })
  public delaySeconds!: number;

  @Column({ type: 'timestamptz', nullable: true })
  public publishedAt!: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  public remoteId!: string | null;
}
