import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

/**
 * TypeORM persistence shape for `Thread`.
 * NOT wired into a module yet (GAP-1); live reads use the in-memory
 * adapter. Table `feed_threads` holds the container row; message rows
 * live in `feed_thread_messages` (FK-less by design, joined on
 * `threadId`).
 */
@Entity('feed_threads')
@Index('idx_fp_threads_status_created', ['status', 'createdAt'])
export class ThreadOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  public id!: string;

  @Column({ type: 'varchar', length: 16, default: 'DRAFT' })
  public status!: string;

  @Column({ type: 'int', default: 0 })
  public messagesPublished!: number;

  @Column({ type: 'int', default: -1 })
  public lastPublishedMessageIndex!: number;

  @Column({ type: 'int', default: 0 })
  public attempts!: number;

  @Column({ type: 'text', nullable: true })
  public failureReason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  public nextAttemptAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public updatedAt!: Date;
}
