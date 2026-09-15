import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { ThreadsMatchMode } from 'threads/publisher/domain/entities/threads-keyword.entity';

/**
 * TypeORM persistence shape for `ThreadsBlacklistPhrase`.
 *
 * Table: `threads_blacklist_phrases` — user-defined phrases the
 * threads-publisher BC matches incoming messages against to filter
 * out unwanted content. Rows are created/deleted via CRUD endpoint;
 * this BC owns them.
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `threads/publisher/domain/entities/threads-blacklist-phrase.entity.ts`
 * and owns invariants (phrase length bounds). The mapper translates
 * between the two so the domain stays pure.
 */
@Entity({ name: 'threads_blacklist_phrases' })
@Index('idx_threads_blacklist_phrases_enabled', ['enabled'])
export class ThreadsBlacklistPhraseEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  public id!: string;

  @Column({ name: 'phrase', type: 'varchar', length: 200 })
  public phrase!: string;

  @Column({ name: 'case_sensitive', type: 'boolean', default: false })
  public caseSensitive!: boolean;

  @Column({
    name: 'match_mode',
    type: 'varchar',
    length: 20,
    default: 'substring',
  })
  public matchMode!: ThreadsMatchMode;

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

  @Column({ name: 'require_image', type: 'boolean', default: false })
  public requireMedia!: boolean;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  public enabled!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
