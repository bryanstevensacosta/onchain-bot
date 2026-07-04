import { Column, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm';
import { CryptoNewsMessageMediaEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';

/**
 * TypeORM persistence shape for `CryptoNewsMessage`.
 *
 * Table: `crypto_news_messages` — ingested news messages from monitored
 * crypto-news channels. Composite uniqueness on (channel_id, message_id)
 * to prevent duplicate ingestion.
 *
 * NOTE: this is NOT the domain entity. The domain entity lives at
 * `telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity.ts`.
 */
@Entity({ name: 'crypto_news_messages' })
@Index('idx_crypto_news_messages_channel_id', ['channelId'])
@Index('idx_crypto_news_messages_ingested_at', ['ingestedAt'])
@Index('uq_crypto_news_messages_channel_message', ['channelId', 'messageId'], {
  unique: true,
})
export class CryptoNewsMessageEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  public id!: string;

  @Column({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ name: 'message_id', type: 'integer' })
  public messageId!: number;

  @Column({ name: 'title', type: 'varchar', length: 512, nullable: true })
  public title!: string | null;

  @Column({ name: 'content', type: 'text' })
  public content!: string;

  @Column({ name: 'published_at', type: 'timestamptz' })
  public publishedAt!: Date;

  @Column({ name: 'ingested_at', type: 'timestamptz' })
  public ingestedAt!: Date;

  @Column({ name: 'link_preview_url', type: 'text', nullable: true })
  public linkPreviewUrl!: string | null;

  @Column({ name: 'link_preview_title', type: 'text', nullable: true })
  public linkPreviewTitle!: string | null;

  @Column({ name: 'link_preview_description', type: 'text', nullable: true })
  public linkPreviewDescription!: string | null;

  @Column({
    name: 'link_preview_site_name',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  public linkPreviewSiteName!: string | null;

  /**
   * Photo attachments for this message. FK-level `ON DELETE CASCADE` is
   * declared on the child side at `CryptoNewsMessageMediaEntity`'s
   * `@ManyToOne({ onDelete: 'CASCADE' })` — in TypeORM 0.3.30 the
   * `onDelete` FK option lives on the relation decorator, NOT on
   * `@JoinColumn` (whose option type rejects it). The
   * `cascade: ['insert', 'update']` here is the TypeORM-level
   * save cascade (not FK-level).
   */
  @OneToMany(() => CryptoNewsMessageMediaEntity, (m) => m.message, {
    cascade: ['insert', 'update'],
    eager: true,
  })
  public media!: CryptoNewsMessageMediaEntity[];
}
