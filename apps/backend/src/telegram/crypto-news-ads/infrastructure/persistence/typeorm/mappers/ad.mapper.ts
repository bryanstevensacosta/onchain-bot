import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { AdEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad.entity';

/**
 * Maps between the domain aggregate `Ad` and its anemic TypeORM
 * persistence shape `AdEntity`.
 */
export class AdMapper {
  public static toEntity(ad: Ad): AdEntity {
    const row = new AdEntity();
    row.id = ad.id;
    row.name = ad.name;
    row.body = ad.body;
    row.imageMediaId = ad.imageMediaId;
    row.format = ad.format;
    row.videoMediaId = ad.videoMediaId;
    row.albumMediaIds = ad.albumMediaIds;
    row.enabled = ad.enabled;
    row.order = ad.order;
    row.timesPublished = ad.timesPublished;
    row.consecutiveFailures = ad.consecutiveFailures;
    row.lastPublishedAt = ad.lastPublishedAt;
    row.expiresAt = ad.expiresAt;
    row.expirationAction = ad.expirationAction;
    row.createdAt = ad.createdAt;
    row.updatedAt = ad.updatedAt;
    return row;
  }

  public static toDomain(row: AdEntity): Ad {
    return Ad.fromSnapshot({
      id: row.id,
      name: row.name,
      body: row.body,
      imageMediaId: row.imageMediaId ?? null,
      format: row.format ?? 'text',
      videoMediaId: row.videoMediaId ?? null,
      albumMediaIds: row.albumMediaIds ?? null,
      enabled: row.enabled,
      order: row.order,
      timesPublished: row.timesPublished,
      consecutiveFailures: row.consecutiveFailures,
      lastPublishedAt: row.lastPublishedAt ?? null,
      expiresAt: row.expiresAt ?? null,
      expirationAction: row.expirationAction ?? 'disable',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
