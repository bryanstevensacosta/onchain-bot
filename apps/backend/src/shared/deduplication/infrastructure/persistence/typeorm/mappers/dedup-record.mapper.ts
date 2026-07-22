import { DedupRecord } from 'shared/deduplication/domain/entities/dedup-record.entity';
import { Fingerprint } from 'shared/deduplication/domain/value-objects/fingerprint.vo';
import { DedupRecordEntity } from '../entities/dedup-record.entity';

/**
 * Maps between the domain entity `DedupRecord` and its TypeORM
 * persistence shape `DedupRecordEntity`.
 */
export class DedupRecordMapper {
  /**
   * Maps a domain `DedupRecord` to its TypeORM entity.
   */
  public static toEntity(record: DedupRecord): DedupRecordEntity {
    const row = new DedupRecordEntity();
    row.id = record.id;
    row.fingerprintType = record.fingerprint.type;
    row.fingerprintValue = record.fingerprint.value;
    row.source = record.source;
    row.channelId = record.channelId;
    row.messageId = record.messageId;

    // Arrays: if empty/undefined -> null, else the array
    const urlsHashes = record.urlsHashes;
    row.urlsHashes =
      urlsHashes && urlsHashes.length > 0 ? [...urlsHashes] : null;

    const tokens = record.tokens;
    row.tokens = tokens && tokens.length > 0 ? [...tokens] : null;

    const numbers = record.numbers;
    row.numbers = numbers && numbers.length > 0 ? [...numbers] : null;

    const entities = record.entities;
    row.entities = entities && entities.length > 0 ? [...entities] : null;

    const cashtags = record.cashtags;
    row.cashtags = cashtags && cashtags.length > 0 ? [...cashtags] : null;

    // Embedding: if null -> null, else the number array
    const embedding = record.embedding;
    row.embedding = embedding ? [...embedding] : null;

    row.referencedEntryId = record.referencedEntryId;
    row.referencedChannelId = record.referencedChannelId;
    row.referencedMessageId = record.referencedMessageId;
    row.createdAt = record.createdAt;

    return row;
  }

  /**
   * Maps a TypeORM entity back to the domain `DedupRecord`.
   *
   * `reconstitute()` skips validation — values originate from a trusted
   * persistence read so missing/malformed rows surface as runtime domain
   * invariants rather than mapper-layer rejections.
   */
  public static toDomain(row: DedupRecordEntity): DedupRecord {
    // Convert simple-array strings back to arrays
    const urlsHashes = row.urlsHashes ? row.urlsHashes : [];
    const tokens = row.tokens ? row.tokens : [];
    const numbers = row.numbers ? row.numbers : [];
    const entities = row.entities ? row.entities : [];
    const cashtags = row.cashtags ? row.cashtags : [];
    const embedding = row.embedding ? row.embedding : null;

    // Ensure createdAt is a Date object
    const createdAt =
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);

    // Reconstruct the Fingerprint VO using factory methods
    const fingerprint = this.reconstructFingerprint(
      row.fingerprintType,
      row.fingerprintValue,
    );

    return DedupRecord.reconstitute({
      id: row.id,
      fingerprint,
      source: row.source,
      channelId: row.channelId,
      messageId: row.messageId,
      urlsHashes,
      tokens,
      numbers,
      entities,
      cashtags,
      embedding,
      referencedEntryId: row.referencedEntryId,
      referencedChannelId: row.referencedChannelId,
      referencedMessageId: row.referencedMessageId,
      createdAt,
    });
  }

  /**
   * Reconstructs a Fingerprint VO from stored type and value.
   * Uses the appropriate factory method based on fingerprint type.
   */
  private static reconstructFingerprint(
    type: string,
    value: string,
  ): Fingerprint {
    switch (type) {
      case 'exact': {
        // Format: `${channelId}:${messageId}`
        const [channelId, messageIdStr] = value.split(':');
        const messageId = parseInt(messageIdStr, 10);
        return Fingerprint.exact(channelId, messageId);
      }
      case 'content':
        return Fingerprint.content(value);
      case 'url':
        return Fingerprint.url(value);
      case 'semantic': {
        // Format: `${channelId}:${messageId}`
        const [channelId, messageIdStr] = value.split(':');
        const messageId = parseInt(messageIdStr, 10);
        return Fingerprint.semantic(channelId, messageId);
      }
      default:
        // Fallback: treat as content type for backward compatibility
        return Fingerprint.content(value);
    }
  }
}
