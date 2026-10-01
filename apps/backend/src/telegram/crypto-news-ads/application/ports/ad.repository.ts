/**
 * @deprecated Moved to apps/feed-publisher/src/scheduling/ (Tramo 2, todo 6 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add scheduling/ads logic in apps/feed-publisher/src/scheduling/ instead.
 */
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';

/**
 * Outbound port: persistence for crypto-news ads.
 */
export abstract class AdRepository {
  public abstract findAll(): Promise<ReadonlyArray<Ad>>;
  public abstract findAllActive(now: Date): Promise<ReadonlyArray<Ad>>;
  public abstract findExpired(now: Date): Promise<ReadonlyArray<Ad>>;
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
