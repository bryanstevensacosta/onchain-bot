import { DedupRecord } from '../../../../domain/entities/dedup-record.entity';
import type { FingerprintType } from '../../../../domain/value-objects/fingerprint.vo';
import { DedupRecordOrmEntity } from '../dedup-record.orm-entity';

/**
 * Domain <-> persistence mapper for `DedupRecord` (unwired GAP-1).
 */
export class DedupRecordMapper {
  public static toRow(record: DedupRecord): DedupRecordOrmEntity {
    const row = new DedupRecordOrmEntity();
    row.id = record.id;
    row.fingerprintType = record.fingerprintType;
    row.fingerprintValue = record.fingerprintValue;
    row.source = record.source;
    row.channelId = record.channelId;
    row.messageId = record.messageId;
    row.contentHash = record.contentHash;
    row.urlHashes = [...record.urlHashes];
    row.tokens = [...record.tokens];
    row.numbers = [...record.numbers];
    row.entities = [...record.entities];
    row.cashtags = [...record.cashtags];
    row.content = record.content;
    row.embedding = record.embedding ? [...record.embedding] : null;
    row.referencedEntryId = record.referencedEntryId;
    row.createdAt = record.createdAt;
    return row;
  }

  public static toDomain(row: DedupRecordOrmEntity): DedupRecord {
    return DedupRecord.reconstitute({
      id: row.id,
      fingerprintType: row.fingerprintType as FingerprintType,
      fingerprintValue: row.fingerprintValue,
      source: row.source,
      channelId: row.channelId,
      messageId: row.messageId,
      contentHash: row.contentHash,
      urlHashes: row.urlHashes ?? [],
      tokens: row.tokens ?? [],
      numbers: row.numbers ?? [],
      entities: row.entities ?? [],
      cashtags: row.cashtags ?? [],
      content: row.content,
      embedding: row.embedding,
      referencedEntryId: row.referencedEntryId,
      createdAt: row.createdAt,
    });
  }
}
