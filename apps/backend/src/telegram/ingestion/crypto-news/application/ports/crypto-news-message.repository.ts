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
   * Look up a single media attachment by its primary key. Returns `null`
   * when no row matches. Used by the binary-serve endpoint (T7) to
   * resolve a `mediaId` to a `filePath` on disk.
   */
  public abstract findMediaById(
    mediaId: string,
  ): Promise<CryptoNewsMessageMediaEntity | null>;
}
