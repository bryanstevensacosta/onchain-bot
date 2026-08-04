import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';

/**
 * Outbound port: persistence for crypto-news ads.
 */
export abstract class AdRepository {
  public abstract findAll(): Promise<ReadonlyArray<Ad>>;
  public abstract findAllActive(): Promise<ReadonlyArray<Ad>>;
  public abstract findById(id: string): Promise<Ad | null>;
  public abstract save(ad: Ad): Promise<Ad>;
  public abstract delete(id: string): Promise<void>;
  public abstract incrementFailures(id: string): Promise<void>;
  public abstract disable(id: string): Promise<void>;
  public abstract markPublished(
    id: string,
    messageId: string,
    at: Date,
  ): Promise<void>;
}
