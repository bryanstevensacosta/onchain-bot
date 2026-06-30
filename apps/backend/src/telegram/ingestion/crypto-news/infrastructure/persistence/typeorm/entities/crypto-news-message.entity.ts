import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

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
}
