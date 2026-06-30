import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import { CryptoNewsSourceEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-source.entity';

/**
 * Maps between the domain aggregate `CryptoNewsSource` and its anemic
 * TypeORM persistence shape `CryptoNewsSourceEntity`.
 */
export class CryptoNewsSourceMapper {
  public static toEntity(source: CryptoNewsSource): CryptoNewsSourceEntity {
    const row = new CryptoNewsSourceEntity();
    row.channelId = source.channelId;
    row.handle = source.handle;
    row.title = source.title;
    row.isActive = source.isActive;
    row.lifecycleStatus = source.lifecycleStatus;
    row.addedAt = (
      source as unknown as { state: { addedAt: Date } }
    ).state.addedAt;
    return row;
  }

  public static toDomain(row: CryptoNewsSourceEntity): CryptoNewsSource {
    return CryptoNewsSource.reconstitute({
      channelId: row.channelId,
      handle: row.handle,
      title: row.title,
      isActive: row.isActive,
      lifecycleStatus: row.lifecycleStatus,
      addedAt: row.addedAt,
    });
  }
}
