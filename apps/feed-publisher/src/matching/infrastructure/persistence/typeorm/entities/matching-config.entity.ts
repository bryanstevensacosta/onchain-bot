import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * TypeORM persistence shape for `MatchingConfig` (single row, id = 1).
 * NOT wired into a module yet (GAP-1); live reads use the in-memory adapter.
 */
@Entity('feed_publisher_matching_config')
export class MatchingConfigEntity {
  @PrimaryColumn({ type: 'int' })
  public id!: number;

  @Column({ type: 'boolean', default: false })
  public enabled!: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  public updatedAt!: Date;
}
