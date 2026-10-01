import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `Keyword` (FK-less per spec: `template_id`
 * is a plain nullable uuid, never a relation).
 *
 * NOT wired into a module yet (no TypeORM forRoot in this app — GAP-1);
 * shipped so the persistence todo has the shape + mapper ready. Live reads
 * go through the in-memory adapter.
 */
@Entity({ name: 'feed_publisher_keywords' })
@Index('idx_feed_publisher_keywords_enabled', ['enabled'])
export class KeywordEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  public id!: string;

  @Column({ name: 'phrase', type: 'varchar', length: 200 })
  public phrase!: string;

  @Column({ name: 'case_sensitive', type: 'boolean', default: false })
  public caseSensitive!: boolean;

  @Column({
    name: 'source_channel_ids',
    type: 'text',
    array: true,
    nullable: true,
    default: '{}',
  })
  public sourceChannelIds!: string[];

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  public templateId!: string | null;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  public enabled!: boolean;

  @Column({ name: 'and_group_id', type: 'uuid', nullable: true })
  public andGroupId!: string | null;

  @Column({ name: 'require_media', type: 'boolean', default: false })
  public requireMedia!: boolean;

  @Column({
    name: 'match_mode',
    type: 'varchar',
    length: 16,
    default: 'substring',
  })
  public matchMode!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
