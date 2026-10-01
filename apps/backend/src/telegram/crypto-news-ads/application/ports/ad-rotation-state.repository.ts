/**
 * @deprecated Moved to apps/feed-publisher/src/scheduling/ (Tramo 2, todo 6 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add scheduling/ads logic in apps/feed-publisher/src/scheduling/ instead.
 */
import { AdRotationState } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-state.entity';

/**
 * Outbound port: persistence for the single-row ads rotation state.
 *
 * This port is intentionally exported from the ads BC module and
 * consumed by the news BC (the news publisher advances
 * `postsSinceLastAd` after every news publish). Cross-BC consumers
 * depend on THIS port, never on the underlying entity.
 */
export abstract class AdRotationStateRepository {
  public abstract load(): Promise<AdRotationState>;
  public abstract save(state: AdRotationState): Promise<void>;
  public abstract incrementPostsSinceLastAd(): Promise<void>;
  public abstract resetPostsSinceLastAd(): Promise<void>;
  public abstract markAdPublished(adId: string, at: Date): Promise<void>;
}
