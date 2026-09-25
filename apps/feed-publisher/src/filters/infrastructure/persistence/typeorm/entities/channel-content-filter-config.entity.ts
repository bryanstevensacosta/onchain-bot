import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `ChannelContentFilterConfig`.
 *
 * Table `channel_content_filter_configs`; `channel_id` is a plain opaque
 * varchar — NEVER add a relation here (sources live in the ingestion
 * service DB; a cross-DB FK is impossible and would recouple the split).
 * NOT wired into a module yet (GAP-1); live reads use the in-memory adapter.
 */
@Entity({ name: 'channel_content_filter_configs' })
@Index('idx_channel_content_filter_configs_ordering', [
  'channelId',
  'priority',
  'createdAt',
])
export class ChannelContentFilterConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ name: 'pattern', type: 'varchar', length: 512 })
  public pattern!: string;

  @Column({ name: 'replacement', type: 'varchar', length: 512, default: '' })
  public replacement!: string;

  @Column({ name: 'flags', type: 'varchar', length: 8, default: 'gi' })
  public flags!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  public isActive!: boolean;

  @Column({ name: 'priority', type: 'int', default: 0 })
  public priority!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
