import { Injectable } from '@nestjs/common';
import { AdMediaLibraryEntry } from '../../../domain/ad-media-library-entry.entity';
import { AdMediaLibraryRepository } from '../../../domain/ports/ad-media-library.repository';

/**
 * In-memory `AdMediaLibraryRepository` — the LIVE binding until
 * GAP-1. `save` is idempotent by `contentHash`: re-saving the same
 * bytes returns the existing row instead of duplicating.
 */
@Injectable()
export class InMemoryAdMediaLibraryRepository extends AdMediaLibraryRepository {
  private readonly rows = new Map<string, AdMediaLibraryEntry>();

  public async findAll(): Promise<ReadonlyArray<AdMediaLibraryEntry>> {
    return [...this.rows.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  public async findById(id: string): Promise<AdMediaLibraryEntry | null> {
    return this.rows.get(id) ?? null;
  }

  public async findByContentHash(
    contentHash: string,
  ): Promise<AdMediaLibraryEntry | null> {
    for (const entry of this.rows.values()) {
      if (entry.contentHash === contentHash) {
        return entry;
      }
    }
    return null;
  }

  public async save(entry: AdMediaLibraryEntry): Promise<AdMediaLibraryEntry> {
    const hit = await this.findByContentHash(entry.contentHash);
    if (hit) {
      return hit;
    }
    this.rows.set(entry.id, entry);
    return entry;
  }

  public async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}
