import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * TypeORM persistence shape for a scheduling post
 * (`feed_scheduled_ads`, P35 feed rename). NOT wired into a module
 * yet (GAP-1); live reads use the in-memory adapter.
 */
@Entity('feed_scheduled_ads')
export class ScheduledAdOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  public name!: string;

  @Column({ type: 'text' })
  public body!: string;

  @Column({ type: 'varchar', length: 16, default: 'text' })
  public format!: string;

  @Column({ type: 'uuid', nullable: true })
  public imageMediaId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  public videoMediaId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  public albumMediaIds!: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  public buttons!: Array<{ text: string; url: string }> | null;

  @Column({ type: 'boolean', default: true })
  public enabled!: boolean;

  @Column({ type: 'int', default: 0 })
  public order!: number;

  @Column({ type: 'int', default: 0 })
  public timesPublished!: number;

  @Column({ type: 'int', default: 0 })
  public consecutiveFailures!: number;

  @Column({ type: 'timestamptz', nullable: true })
  public lastPublishedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  public expiresAt!: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'disable' })
  public expirationAction!: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public updatedAt!: Date;
}
