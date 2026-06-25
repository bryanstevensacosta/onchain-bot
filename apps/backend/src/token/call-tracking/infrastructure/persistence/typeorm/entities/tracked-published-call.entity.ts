import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `TrackedPublishedCall`.
 *
 * `id` is `${chain}:${addressLowercased}` (stored as PK) so that
 * re-publishing the same (chain, address) updates the existing row
 * (idempotent upsert).
 */
@Entity({ name: 'tracked_published_calls' })
@Index('idx_tracked_published_calls_kol', ['kolId'])
@Index('idx_tracked_published_calls_published_at', ['publishedAt'])
@Index('idx_tracked_published_calls_active', ['isActive'])
export class TrackedPublishedCallOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ name: 'kol_id', type: 'varchar', length: 64 })
  public kolId!: string;

  @Column({ name: 'chain', type: 'varchar', length: 32 })
  public chain!: string;

  @Column({ name: 'address', type: 'varchar', length: 128 })
  public address!: string;

  @Column({ name: 'ticker', type: 'varchar', length: 32, nullable: true })
  public ticker!: string | null;

  @Column({ name: 'mc_at_publish', type: 'real', nullable: false })
  public mcAtPublish!: number;

  @Column({ name: 'mc_now', type: 'real', nullable: true })
  public mcNow!: number | null;

  @Column({ name: 'milestones_hit', type: 'jsonb', nullable: false })
  public milestonesHit!: number[];

  @Column({ name: 'max_milestone', type: 'real', nullable: true })
  public maxMilestone!: number | null;

  @Column({ name: 'price_drop_percent', type: 'real', nullable: true })
  public priceDropPercent!: number | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: false })
  public publishedAt!: Date;

  @Column({ name: 'last_updated_at', type: 'timestamptz', nullable: false })
  public lastUpdatedAt!: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  public isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
