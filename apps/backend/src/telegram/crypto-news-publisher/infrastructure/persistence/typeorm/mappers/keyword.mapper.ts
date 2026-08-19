import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';
import { KeywordEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/keyword.entity';

/**
 * Maps between the domain aggregate `Keyword` and its anemic TypeORM
 * persistence shape `KeywordEntity`.
 */
export class KeywordMapper {
  public static toEntity(keyword: Keyword): KeywordEntity {
    const row = new KeywordEntity();
    row.id = keyword.id;
    row.phrase = keyword.phrase;
    row.caseSensitive = keyword.caseSensitive;
    row.sourceChannelIds = keyword.sourceChannelIds;
    row.templateId = keyword.templateId;
    row.enabled = keyword.enabled;
    row.andGroupId = keyword.andGroupId;
    row.requireMedia = keyword.requireMedia;
    row.matchMode = keyword.matchMode;
    row.createdAt = keyword.createdAt;
    return row;
  }

  public static toDomain(row: KeywordEntity): Keyword {
    return Keyword.reconstitute({
      id: row.id,
      phrase: row.phrase,
      caseSensitive: row.caseSensitive,
      sourceChannelIds: row.sourceChannelIds ?? [],
      templateId: row.templateId,
      enabled: row.enabled,
      andGroupId: row.andGroupId,
      requireMedia: row.requireMedia,
      matchMode: row.matchMode as 'exact' | 'substring',
      createdAt: row.createdAt,
    });
  }
}
