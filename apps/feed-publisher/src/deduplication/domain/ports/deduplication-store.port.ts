import type { DedupRecord } from '../entities/dedup-record.entity';

/**
 * Outbound port: dedup fingerprint persistence.
 *
 * Live binding is the in-memory store (GAP-1); the TypeORM shape
 * (`dedup_fingerprints`, plain table — NO pgvector) ships unwired beside
 * it. All reads return null/[] on miss; implementations MUST NOT throw
 * for missing rows (fail-open is orchestrated in DeduplicationService).
 */
export abstract class DeduplicationStorePort {
  public abstract save(record: DedupRecord): Promise<void>;
  public abstract findExact(
    source: string,
    channelId: string,
    messageId: number,
  ): Promise<DedupRecord | null>;
  public abstract findByContentHash(
    source: string,
    contentHash: string,
  ): Promise<DedupRecord | null>;
  public abstract findByUrlHashes(
    source: string,
    urlHashes: string[],
  ): Promise<DedupRecord[]>;
  public abstract findRecentWithEmbeddings(
    source: string,
    since: Date,
  ): Promise<DedupRecord[]>;
}
