import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';

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
}
