import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `ThreadsKeyword`.
 *
 * Table: `threads_keywords` — user-defined keywords the
 * threads-publisher BC matches incoming messages against. Rows are
 * created/deleted via the CRUD endpoint (T4); this BC owns them.
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `threads/publisher/domain/entities/threads-keyword.entity.ts`
 * and owns invariants (phrase length bounds). The mapper translates
 * between the two so the domain stays pure.
 */
@Entity({ name: 'threads_keywords' })
@Index('idx_threads_keywords_enabled', ['enabled'])
@Index('idx_threads_keywords_template_id', ['templateId'])
export class ThreadsKeywordEntity {
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

  /**
   * Optional binding to a `ThreadsPromptTemplate`. When non-null the
   * publisher uses this template (instead of
   * `ThreadsLlmConfig.defaultTemplateId`) when refining messages
   * matched by this keyword. No DB-level FK (enforced at the
   * application layer) so the migration lands without ordering
   * constraints.
   */
  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  public templateId!: string | null;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  public enabled!: boolean;

  @Column({ name: 'and_group_id', type: 'uuid', nullable: true })
  public andGroupId!: string | null;

  @Column({ name: 'require_image', type: 'boolean', default: false })
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
