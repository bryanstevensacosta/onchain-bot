/**
 * @deprecated Moved to apps/feed-publisher/src/threads/ (Tramo 2, todo 8 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add threads logic in apps/feed-publisher/src/threads/ instead.
 */
import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * TypeORM persistence shape for `ThreadsMatchingConfig`.
 *
 * Table: `threads_matching_configs` — single-row config for threads
 * keyword matching (`id = 1`). This is the ONLY source of truth for
 * matching activation (no legacy flag on the LLM config — unlike the
 * crypto-news mirror, whose legacy `matching_enabled` was dropped in
 * migration 1875000000002).
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `threads/integration/domain/entities/threads-matching-config.entity.ts`.
 */
@Entity('threads_matching_configs')
export class ThreadsMatchingConfigEntity {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
