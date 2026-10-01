/**
 * @deprecated Moved to apps/feed-publisher/src/threads/ (Tramo 2, todo 8 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add threads logic in apps/feed-publisher/src/threads/ instead.
 */
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * TypeORM persistence shape for `ThreadsThrottleState`.
 *
 * Table: `threads_throttle_states` — singleton row (always `id = 1`)
 * holding the most-recent publish timestamp. Persisted (NOT
 * in-memory) so a backend restart does not reset the throttle and
 * allow a burst of publishes immediately after boot.
 *
 * NOTE: this is NOT the domain entity. The domain value lives at
 * `threads/publisher/domain/entities/threads-throttle-state.entity.ts`.
 */
@Entity({ name: 'threads_throttle_states' })
export class ThreadsThrottleStateEntity {
  /**
   * Always 1 (singleton). Hard-coded because the cron publisher and
   * the repo must read/write the same row — there is exactly one
   * "publisher instance" per process.
   */
  @PrimaryColumn({ name: 'id', type: 'integer' })
  public id!: number;

  @Column({ name: 'last_publish_at', type: 'timestamptz', nullable: true })
  public lastPublishAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
