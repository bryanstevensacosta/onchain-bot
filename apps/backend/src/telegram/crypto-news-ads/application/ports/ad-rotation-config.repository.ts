/**
 * @deprecated Moved to apps/feed-publisher/src/scheduling/ (Tramo 2, todo 6 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add scheduling/ads logic in apps/feed-publisher/src/scheduling/ instead.
 */
import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';

/**
 * Outbound port: persistence for the single-row ads rotation config.
 */
export abstract class AdRotationConfigRepository {
  public abstract load(): Promise<AdRotationConfig>;
  public abstract save(cfg: AdRotationConfig): Promise<void>;
}
