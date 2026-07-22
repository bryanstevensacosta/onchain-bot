/**
 * Port interface for deduplication storage operations.
 *
 * This port defines the contract for persisting and querying
 * deduplication records. Implementations can use in-memory,
 * TypeORM, Redis, or any other storage mechanism.
 */

import { DedupRecord } from 'shared/deduplication/domain/entities/dedup-record.entity';
import { Fingerprint } from 'shared/deduplication/domain/value-objects/fingerprint.vo';

export abstract class DeduplicationStore {
  /**
   * Saves a deduplication record to the store.
   */
  abstract save(record: DedupRecord): Promise<void>;

  /**
   * Finds an existing record by exact fingerprint and source.
   */
  abstract findExisting(
    fingerprint: Fingerprint,
    source: string,
  ): Promise<DedupRecord | null>;

  /**
   * Finds an existing record by URL hash within a time window.
   */
  abstract findByUrlHash(
    urlHash: string,
    source: string,
    sinceDate: Date,
  ): Promise<DedupRecord | null>;

  /**
   * Finds similar records by embedding similarity within a time window.
   */
  abstract findSimilarEmbeddings(
    embedding: number[],
    source: string,
    sinceDate: Date,
    threshold: number,
  ): Promise<Array<{ record: DedupRecord; similarity: number }>>;

  /**
   * Marks a record as seen (updates timestamp or status).
   */
  abstract markSeen(record: DedupRecord): Promise<void>;

  /**
   * Prunes records older than the specified hours.
   *
   * @returns The number of records pruned.
   */
  abstract pruneOlderThan(hours: number): Promise<number>;
}
