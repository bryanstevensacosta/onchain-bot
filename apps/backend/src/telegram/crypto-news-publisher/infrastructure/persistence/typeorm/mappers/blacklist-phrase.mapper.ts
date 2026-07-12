import { BlacklistPhrase } from 'telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity';
import { BlacklistPhraseEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/blacklist-phrase.entity';

/**
 * Maps between the domain aggregate `BlacklistPhrase` and its anemic TypeORM
 * persistence shape `BlacklistPhraseEntity`.
 */
export class BlacklistPhraseMapper {
  public static toEntity(
    blacklistPhrase: BlacklistPhrase,
  ): BlacklistPhraseEntity {
    const row = new BlacklistPhraseEntity();
    row.id = blacklistPhrase.id;
    row.phrase = blacklistPhrase.phrase;
    row.caseSensitive = blacklistPhrase.caseSensitive;
    row.sourceChannelIds = blacklistPhrase.sourceChannelIds;
    row.enabled = blacklistPhrase.enabled;
    row.createdAt = blacklistPhrase.createdAt;
    return row;
  }

  public static toDomain(row: BlacklistPhraseEntity): BlacklistPhrase {
    return BlacklistPhrase.reconstitute({
      id: row.id,
      phrase: row.phrase,
      caseSensitive: row.caseSensitive,
      sourceChannelIds: row.sourceChannelIds ?? [],
      enabled: row.enabled,
      createdAt: row.createdAt,
    });
  }
}
