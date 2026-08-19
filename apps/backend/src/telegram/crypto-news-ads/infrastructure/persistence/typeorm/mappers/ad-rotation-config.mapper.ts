import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';
import { AdRotationConfigEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-rotation-config.entity';

/**
 * Maps between the domain aggregate `AdRotationConfig` and its anemic
 * TypeORM persistence shape `AdRotationConfigEntity`.
 */
export class AdRotationConfigMapper {
  public static toEntity(cfg: AdRotationConfig): AdRotationConfigEntity {
    const row = new AdRotationConfigEntity();
    row.id = cfg.id;
    row.enabled = cfg.enabled;
    row.everyNPosts = cfg.everyNPosts;
    row.minMinutesBetweenAds = cfg.minMinutesBetweenAds;
    row.createdAt = cfg.createdAt;
    row.updatedAt = cfg.updatedAt;
    return row;
  }

  public static toDomain(row: AdRotationConfigEntity): AdRotationConfig {
    return AdRotationConfig.fromSnapshot({
      id: row.id,
      enabled: row.enabled,
      everyNPosts: row.everyNPosts,
      minMinutesBetweenAds: row.minMinutesBetweenAds,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
