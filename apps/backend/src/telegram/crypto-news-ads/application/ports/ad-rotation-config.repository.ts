import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';

/**
 * Outbound port: persistence for the single-row ads rotation config.
 */
export abstract class AdRotationConfigRepository {
  public abstract load(): Promise<AdRotationConfig>;
  public abstract save(cfg: AdRotationConfig): Promise<void>;
}
