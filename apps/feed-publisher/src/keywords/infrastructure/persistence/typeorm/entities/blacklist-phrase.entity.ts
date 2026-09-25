import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `BlacklistPhrase` (FK-less per spec).
 * NOT wired into a module yet (GAP-1); live reads use the in-memory adapter.
 */
@Entity({ name: 'feed_publisher_blacklist_phrases' })
@Index('idx_feed_publisher_blacklist_phrases_enabled', ['enabled'])
export class BlacklistPhraseEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  public id!: string;

  @Column({ name: 'phrase', type: 'varchar', length: 200 })
  public phrase!: string;

  @Column({ name: 'case_sensitive', type: 'boolean', default: false })
  public caseSensitive!: boolean;

  @Column({
    name: 'match_mode',
    type: 'varchar',
    length: 16,
    default: 'substring',
  })
  public matchMode!: string;

  @Column({
    name: 'source_channel_ids',
    type: 'text',
    array: true,
    nullable: true,
    default: '{}',
  })
  public sourceChannelIds!: string[];

  @Column({ name: 'and_group_id', type: 'uuid', nullable: true })
  public andGroupId!: string | null;

  @Column({ name: 'require_media', type: 'boolean', default: false })
  public requireMedia!: boolean;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  public enabled!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
