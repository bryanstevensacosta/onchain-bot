import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';

/**
 * Outbound port: persistence for crypto-news Telegram sources.
 *
 * Implemented in infrastructure/repositories with the chosen storage
 * (in-memory for dev, TypeORM for prod).
 */
export abstract class CryptoNewsSourceRepository {
  public abstract save(source: CryptoNewsSource): Promise<void>;
  public abstract findByChannelId(
    channelId: string,
  ): Promise<CryptoNewsSource | null>;
  public abstract findAll(): Promise<ReadonlyArray<CryptoNewsSource>>;
  public abstract findActive(): Promise<ReadonlyArray<CryptoNewsSource>>;
  public abstract delete(channelId: string): Promise<void>;
}
