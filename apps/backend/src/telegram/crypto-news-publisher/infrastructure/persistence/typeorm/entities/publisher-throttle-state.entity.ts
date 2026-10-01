/**
 * @deprecated Moved to apps/feed-publisher/src/queue/ + apps/feed-publisher/src/llm/ + apps/feed-publisher/src/keywords/ (Tramo 2, todos 3+4+5 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add queue/llm/keywords logic in apps/feed-publisher/src/{queue,llm,keywords}/ instead.
 */
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * TypeORM persistence shape for `PublisherThrottleState`.
 *
 * Table: `crypto_news_publisher_throttle_state` — singleton row
 * (always `id = 1`) holding the most-recent publish timestamp.
 * Persisted (NOT in-memory) so a backend restart does not reset the
 * throttle and allow a burst of publishes immediately after boot.
 *
 * NOTE: this is NOT the domain entity. The domain entity lives at
 * `telegram/crypto-news-publisher/domain/entities/publisher-throttle-state.entity.ts`.
 */
@Entity({ name: 'crypto_news_publisher_throttle_state' })
export class PublisherThrottleStateEntity {
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
