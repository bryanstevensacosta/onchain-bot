import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * TypeORM persistence shape for a per-post media attachment
 * (`feed_scheduled_ad_media`). NOT wired yet (GAP-1); live reads use
 * the in-memory adapter. Cascade-delete with the post is enforced by
 * the controller until the FK ships with the wiring.
 */
@Entity('feed_scheduled_ad_media')
export class ScheduledAdMediaOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string;

  @Column({ type: 'uuid' })
  public adId!: string;

  @Column({ type: 'text' })
  public filePath!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  public mimeType!: string | null;

  @Column({ type: 'int', nullable: true })
  public fileSize!: number | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;
}
