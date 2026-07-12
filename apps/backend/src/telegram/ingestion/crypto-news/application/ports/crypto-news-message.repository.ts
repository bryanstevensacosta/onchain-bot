import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageMediaEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';

/**
 * Outbound port: persistence for ingested crypto-news messages.
 *
 * Implemented in infrastructure/repositories with the chosen storage
 * (in-memory for dev, TypeORM for prod).
 */
export abstract class CryptoNewsMessageRepository {
  public abstract save(message: CryptoNewsMessage): Promise<void>;
  public abstract findById(id: string): Promise<CryptoNewsMessage | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<CryptoNewsMessage>>;
  public abstract findByChannelId(
    channelId: string,
    limit: number,
  ): Promise<ReadonlyArray<CryptoNewsMessage>>;
  /**
   * Look up a single message by its Telegram-side (channelId, messageId).
   * Returns `null` when no row matches. Used by the crypto-news-publisher
   * BC (Wave 3) to fetch the full message — including `content`, `media[]`,
   * `linkPreviewUrl`, `groupedId` — for keyword matching. The
   * `CryptoNewsMessageIngestedEvent` deliberately does NOT carry `content`
   * (fix-1 Bot Dev ToS §4.3), so consumers must go through this lookup.
   */
  public abstract findByChannelAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<CryptoNewsMessage | null>;
  /**
   * Look up a single media attachment by its primary key. Returns `null`
   * when no row matches. Used by the binary-serve endpoint (T7) to
   * resolve a `mediaId` to a `filePath` on disk.
   */
  public abstract findMediaById(
    mediaId: string,
  ): Promise<CryptoNewsMessageMediaEntity | null>;

  /**
   * Find all messages in the same Telegram album/media group. Returns all
   * messages that share the same `groupedId` AND the same `channelId`.
   * Used by the publisher enqueue use case to merge album photos into a
   * single queue entry with multiple `imagePaths` so the publisher can
   * dispatch them as a `sendMediaGroup` (album) instead of separate
   * `sendPhoto` calls.
   *
   * Returns an empty array when no grouped siblings exist.
   */
  public abstract findByChannelAndGroupedId(
    channelId: string,
    groupedId: string,
  ): Promise<ReadonlyArray<CryptoNewsMessage>>;
}
