/**
 * In-memory implementation of DeduplicationStore.
 *
 * Provides a Map-based fallback when database is disabled.
 * Uses composite key: `${fingerprintType}:${fingerprintValue}:${source}`
 */

import { Injectable, Logger } from '@nestjs/common';
import { DedupRecord } from 'shared/deduplication/domain/entities/dedup-record.entity';
import { Fingerprint } from 'shared/deduplication/domain/value-objects/fingerprint.vo';
import { DeduplicationStore } from 'shared/deduplication/application/ports/deduplication-store.port';

@Injectable()
export class InMemoryDeduplicationStore extends DeduplicationStore {
  private readonly logger = new Logger(InMemoryDeduplicationStore.name);

  /**
   * Primary store: key -> DedupRecord
   * Key format: `${fingerprintType}:${fingerprintValue}:${source}`
   */
  private readonly store = new Map<string, DedupRecord>();

  /**
   * Secondary index: id -> DedupRecord
   * For iteration in findSimilarEmbeddings
   */
  private readonly byId = new Map<string, DedupRecord>();

  /**
   * Generates the composite storage key.
   */
  private getKey(fingerprint: Fingerprint, source: string): string {
    return `${fingerprint.type}:${fingerprint.value}:${source}`;
  }

  /**
   * Saves a deduplication record to the store.
   */
  async save(record: DedupRecord): Promise<void> {
    const key = this.getKey(record.fingerprint, record.source);
    this.store.set(key, record);
    this.byId.set(record.id, record);
    this.logger.debug(`Saved record with key: ${key}`);
  }

  /**
   * Finds an existing record by exact fingerprint and source.
   */
  async findExisting(
    fingerprint: Fingerprint,
    source: string,
  ): Promise<DedupRecord | null> {
    const key = this.getKey(fingerprint, source);
    const record = this.store.get(key);
    this.logger.debug(
      `findExisting: ${key} -> ${record ? 'found' : 'not found'}`,
    );
    return record ?? null;
  }

  /**
   * Finds an existing record by URL hash within a time window.
   */
  async findByUrlHash(
    urlHash: string,
    source: string,
    sinceDate: Date,
  ): Promise<DedupRecord | null> {
    // Iterate through all records with URL fingerprint type
    for (const record of this.store.values()) {
      if (
        record.fingerprint.type === 'url' &&
        record.fingerprint.value === urlHash &&
        record.source === source &&
        record.createdAt >= sinceDate
      ) {
        this.logger.debug(`findByUrlHash: found match for ${urlHash}`);
        return record;
      }
    }
    this.logger.debug(`findByUrlHash: no match for ${urlHash}`);
    return null;
  }

  /**
   * Finds similar records by embedding similarity within a time window.
   */
  async findSimilarEmbeddings(
    embedding: readonly number[],
    source: string,
    sinceDate: Date,
    threshold: number,
  ): Promise<Array<{ record: DedupRecord; similarity: number }>> {
    const results: Array<{ record: DedupRecord; similarity: number }> = [];

    // Iterate through all records in byId index
    for (const record of this.byId.values()) {
      // Skip records not matching criteria
      if (record.source !== source) continue;
      if (record.createdAt < sinceDate) continue;
      if (!record.embedding || record.embedding.length === 0) continue;

      // Compute cosine similarity
      const similarity = this.computeCosineSimilarity(
        embedding,
        record.embedding,
      );

      if (similarity >= threshold) {
        results.push({ record, similarity });
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    this.logger.debug(
      `findSimilarEmbeddings: found ${results.length} candidates above threshold ${threshold}`,
    );
    return results;
  }

  /**
   * Computes cosine similarity between two embeddings.
   */
  private computeCosineSimilarity(
    a: readonly number[],
    b: readonly number[],
  ): number {
    if (a.length === 0 || b.length === 0) {
      return 0;
    }

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const valA = a[i] ?? 0;
      const valB = b[i] ?? 0;
      dot += valA * valB;
      magA += valA * valA;
      magB += valB * valB;
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    if (magnitude === 0) {
      return 0;
    }

    return dot / magnitude;
  }

  /**
   * Marks a record as seen (updates timestamp or status).
   * Delegates to save for in-memory implementation.
   */
  async markSeen(record: DedupRecord): Promise<void> {
    await this.save(record);
  }

  /**
   * Prunes records older than the specified hours.
   *
   * @returns The number of records pruned.
   */
  async pruneOlderThan(hours: number): Promise<number> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    let prunedCount = 0;

    // Collect keys to remove (can't modify during iteration)
    const keysToRemove: string[] = [];

    for (const [key, record] of this.store.entries()) {
      if (record.createdAt < cutoff) {
        keysToRemove.push(key);
      }
    }

    // Remove from both indexes
    for (const key of keysToRemove) {
      const record = this.store.get(key);
      if (record) {
        this.byId.delete(record.id);
      }
      this.store.delete(key);
      prunedCount++;
    }

    this.logger.log(`Pruned ${prunedCount} records older than ${hours} hours`);
    return prunedCount;
  }
}
