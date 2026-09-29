/**
 * @deprecated Moved to apps/feed-publisher/src/ingestion/ + apps/feed-publisher/src/matching/ (Tramo 2, todos 2+3 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add feed ingestion/matching logic in apps/feed-publisher/src/ingestion/ or apps/feed-publisher/src/matching/ instead.
 */
import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('crypto_news_matching_config')
export class MatchingConfigEntity {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
