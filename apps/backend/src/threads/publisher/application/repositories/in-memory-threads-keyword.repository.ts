import { Injectable } from '@nestjs/common';
import { ThreadsKeyword } from 'threads/publisher/domain/entities/threads-keyword.entity';
import { ThreadsKeywordRepository } from 'threads/publisher/application/ports/threads-keyword.repository';

/**
 * In-memory `ThreadsKeywordRepository` for specs and local wiring.
 *
 * Threads-typed mirror of the crypto-news in-memory keyword store:
 * plain `Map` CRUD, no pagination (the table holds a few rows at
 * most). `save()` upserts by id; `delete()` is a no-op for unknown
 * ids.
 */
@Injectable()
export class InMemoryThreadsKeywordRepository extends ThreadsKeywordRepository {
  private readonly rows = new Map<string, ThreadsKeyword>();

  public async findAll(): Promise<ReadonlyArray<ThreadsKeyword>> {
    return [...this.rows.values()];
  }

  public async findEnabled(): Promise<ReadonlyArray<ThreadsKeyword>> {
    return [...this.rows.values()].filter((kw) => kw.enabled);
  }

  public async save(keyword: ThreadsKeyword): Promise<void> {
    this.rows.set(keyword.id, keyword);
  }

  public async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}
