import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `Keyword`.
 *
 * Table: `crypto_news_publisher_keywords` — user-defined keywords the
 * crypto-news-publisher BC matches incoming messages against. Rows are
 * created/deleted via the CRUD endpoint (Wave 3); this BC owns them.
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `telegram/crypto-news-publisher/domain/entities/keyword.entity.ts`
 * and owns invariants (phrase length bounds). The mapper translates
 * between the two so the domain stays pure.
 */
@Entity({ name: 'crypto_news_publisher_keywords' })
@Index('idx_crypto_news_publisher_keywords_enabled', ['enabled'])
@Index('idx_crypto_news_publisher_keywords_template_id', ['templateId'])
export class KeywordEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  public id!: string;

  @Column({ name: 'phrase', type: 'varchar', length: 200 })
  public phrase!: string;

  @Column({ name: 'case_sensitive', type: 'boolean', default: false })
  public caseSensitive!: boolean;

  @Column({
    name: 'source_channel_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  public sourceChannelId!: string | null;

  /**
   * Optional binding to a `PromptTemplate`. When non-null the publisher
   * uses this template (instead of `LlmConfig.defaultTemplateId`) when
   * refining messages matched by this keyword. The FK is enforced at
   * the application layer (DELETE on a template that is in use is
   * refused at the controller — T2) — there is no DB-level FK so the
   * migration can land without a circular dependency on PromptTemplate
   * being seeded first.
   */
  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  public templateId!: string | null;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  public enabled!: boolean;

  @Column({ name: 'require_image', type: 'boolean', default: false })
  public requireImage!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
