import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * TypeORM persistence shape for the shared scheduling media library
 * (`feed_ad_media_library`, FK-less by design). NOT wired yet
 * (GAP-1); live reads use the in-memory adapter.
 */
@Entity('feed_ad_media_library')
export class AdMediaLibraryOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string;

  @Column({ type: 'text', unique: true })
  public filePath!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  public contentHash!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  public originalFileName!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  public mimeType!: string | null;

  @Column({ type: 'int', nullable: true })
  public fileSize!: number | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;
}
