import { Injectable } from '@nestjs/common';
import { ThreadsBlacklistPhrase } from 'threads/publisher/domain/entities/threads-blacklist-phrase.entity';
import { ThreadsBlacklistPhraseRepository } from 'threads/publisher/application/ports/threads-blacklist-phrase.repository';

/**
 * In-memory `ThreadsBlacklistPhraseRepository` for specs and local
 * wiring.
 *
 * Threads-typed mirror of the crypto-news in-memory blacklist store:
 * plain `Map` CRUD, no pagination (the table holds a few rows at
 * most). `save()` upserts by id; `delete()` is a no-op for unknown
 * ids.
 */
@Injectable()
export class InMemoryThreadsBlacklistPhraseRepository extends ThreadsBlacklistPhraseRepository {
  private readonly rows = new Map<string, ThreadsBlacklistPhrase>();

  public async findAll(): Promise<ReadonlyArray<ThreadsBlacklistPhrase>> {
    return [...this.rows.values()];
  }

  public async findEnabled(): Promise<ReadonlyArray<ThreadsBlacklistPhrase>> {
    return [...this.rows.values()].filter((phrase) => phrase.enabled);
  }

  public async save(phrase: ThreadsBlacklistPhrase): Promise<void> {
    this.rows.set(phrase.id, phrase);
  }

  public async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}
