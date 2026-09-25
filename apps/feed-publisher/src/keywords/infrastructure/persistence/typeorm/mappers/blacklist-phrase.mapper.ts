import { BlacklistPhrase } from '../../../../domain/blacklist-phrase.entity';
import { BlacklistPhraseEntity } from '../entities/blacklist-phrase.entity';
import type { MatchMode } from '../../../../domain/match-mode';

/**
 * Domain <-> persistence mapper for `BlacklistPhrase`.
 */
export class BlacklistPhraseMapper {
  public static toEntity(phrase: BlacklistPhrase): BlacklistPhraseEntity {
    const row = new BlacklistPhraseEntity();
    row.id = phrase.id;
    row.phrase = phrase.phrase;
    row.caseSensitive = phrase.caseSensitive;
    row.matchMode = phrase.matchMode;
    row.sourceChannelIds = phrase.sourceChannelIds;
    row.enabled = phrase.enabled;
    row.andGroupId = phrase.andGroupId;
    row.requireMedia = phrase.requireMedia;
    row.createdAt = phrase.createdAt;
    return row;
  }

  public static toDomain(row: BlacklistPhraseEntity): BlacklistPhrase {
    return BlacklistPhrase.reconstitute({
      id: row.id,
      phrase: row.phrase,
      caseSensitive: row.caseSensitive,
      matchMode: row.matchMode as MatchMode,
      sourceChannelIds: row.sourceChannelIds ?? [],
      enabled: row.enabled,
      andGroupId: row.andGroupId,
      requireMedia: row.requireMedia,
      createdAt: row.createdAt,
    });
  }
}
