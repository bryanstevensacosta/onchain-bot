import { AdRotationState } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-state.entity';
import { AdRotationStateEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-rotation-state.entity';

/**
 * Maps between the domain aggregate `AdRotationState` and its anemic
 * TypeORM persistence shape `AdRotationStateEntity`.
 */
export class AdRotationStateMapper {
  public static toEntity(state: AdRotationState): AdRotationStateEntity {
    const row = new AdRotationStateEntity();
    row.id = state.id;
    row.postsSinceLastAd = state.postsSinceLastAd;
    row.lastAdId = state.lastAdId;
    row.lastAdPublishedAt = state.lastAdPublishedAt;
    row.updatedAt = state.updatedAt;
    return row;
  }

  public static toDomain(row: AdRotationStateEntity): AdRotationState {
    return AdRotationState.fromSnapshot({
      id: row.id,
      postsSinceLastAd: row.postsSinceLastAd,
      lastAdId: row.lastAdId ?? null,
      lastAdPublishedAt: row.lastAdPublishedAt ?? null,
      updatedAt: row.updatedAt,
    });
  }
}
