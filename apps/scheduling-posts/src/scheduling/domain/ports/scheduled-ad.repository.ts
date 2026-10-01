import { ScheduledAd } from '../scheduled-ad.entity';

/**
 * Outbound port: persistence for scheduling posts (moved from the
 * backend ads catalog, renamed to scheduling).
 */
export abstract class ScheduledAdRepository {
  public abstract findAll(): Promise<ReadonlyArray<ScheduledAd>>;
  public abstract findAllActive(now: Date): Promise<ReadonlyArray<ScheduledAd>>;
  public abstract findExpired(now: Date): Promise<ReadonlyArray<ScheduledAd>>;
  public abstract findById(id: string): Promise<ScheduledAd | null>;
  public abstract save(ad: ScheduledAd): Promise<ScheduledAd>;
  public abstract delete(id: string): Promise<void>;
  public abstract incrementFailures(id: string): Promise<void>;
  public abstract disable(id: string): Promise<void>;
  public abstract markPublished(
    id: string,
    messageId: string,
    at: Date,
  ): Promise<void>;
}
