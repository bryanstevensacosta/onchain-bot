import { Keyword } from '../../../../domain/keyword.entity';
import { KeywordEntity } from '../entities/keyword.entity';
import type { MatchMode } from '../../../../domain/match-mode';

/**
 * Domain <-> persistence mapper for `Keyword` (keeps the domain pure;
 * the TypeORM shape is anemic by design).
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
      matchMode: row.matchMode as MatchMode,
      createdAt: row.createdAt,
    });
  }
}
