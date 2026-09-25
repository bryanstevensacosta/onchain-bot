import { Injectable } from '@nestjs/common';
import { DedupRecord } from '../../domain/entities/dedup-record.entity';
import { DeduplicationStorePort } from '../../domain/ports/deduplication-store.port';

/**
 * In-memory `DeduplicationStorePort` — the LIVE binding until GAP-1.
 *
 * Bounded (cap 5000 rows, oldest evicted) so a long-lived dev process
 * cannot grow without limit. Keyed by (type, value, source).
 */
@Injectable()
export class InMemoryDeduplicationStore extends DeduplicationStorePort {
  private readonly rows = new Map<string, DedupRecord>();
  private readonly MAX_ROWS = 5000;

  private key(type: string, value: string, source: string): string {
    return `${type}:${value}:${source}`;
  }

  public async save(record: DedupRecord): Promise<void> {
    this.rows.set(
      this.key(record.fingerprintType, record.fingerprintValue, record.source),
      record,
    );
    while (this.rows.size > this.MAX_ROWS) {
      const oldest = this.rows.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.rows.delete(oldest.value);
    }
  }

  public async findExact(
    source: string,
    channelId: string,
    messageId: number,
  ): Promise<DedupRecord | null> {
    return (
      this.rows.get(this.key('exact', `${channelId}:${messageId}`, source)) ??
      null
    );
  }

  public async findByContentHash(
    source: string,
    contentHash: string,
  ): Promise<DedupRecord | null> {
    return this.rows.get(this.key('content', contentHash, source)) ?? null;
  }

  public async findByUrlHashes(
    source: string,
    urlHashes: string[],
  ): Promise<DedupRecord[]> {
    const wanted = new Set(urlHashes);
    const out: DedupRecord[] = [];
    for (const record of this.rows.values()) {
      if (record.source !== source || record.fingerprintType !== 'url') {
        continue;
      }
      if (wanted.has(record.fingerprintValue)) {
        out.push(record);
      }
    }
    return out;
  }

  public async findRecentWithEmbeddings(
    source: string,
    since: Date,
  ): Promise<DedupRecord[]> {
    const out: DedupRecord[] = [];
    for (const record of this.rows.values()) {
      if (record.source !== source) {
        continue;
      }
      if (record.embedding === null) {
        continue;
      }
      if (record.createdAt < since) {
        continue;
      }
      out.push(record);
    }
    return out;
  }
}
