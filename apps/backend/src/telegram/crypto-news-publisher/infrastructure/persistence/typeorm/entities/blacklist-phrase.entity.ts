import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { MatchMode } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';

/**
 * TypeORM persistence shape for `BlacklistPhrase`.
 *
 * Table: `blacklist_phrases` — user-defined phrases the crypto-news-publisher
 * BC matches incoming messages against to filter out unwanted content.
 * Rows are created/deleted via CRUD endpoint; this BC owns them.
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts`
 * and owns invariants (phrase length bounds). The mapper translates
 * between the two so the domain stays pure.
 */
@Entity({ name: 'blacklist_phrases' })
@Index('idx_blacklist_phrases_enabled', ['enabled'])
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
    length: 20,
    default: 'substring',
  })
  public matchMode!: MatchMode;

  @Column({
    name: 'source_channel_ids',
    type: 'text',
    array: true,
    nullable: true,
    default: '{}',
  })
  public sourceChannelIds!: string[];

  @Column({ name: 'enabled', type: 'boolean', default: true })
  public enabled!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
