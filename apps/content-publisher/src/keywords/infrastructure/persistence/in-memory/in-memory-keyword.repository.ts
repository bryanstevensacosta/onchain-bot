import { Injectable } from '@nestjs/common';
import { Keyword } from '../../../domain/keyword.entity';
import { KeywordRepository } from '../../../application/ports/keyword.repository';

/**
 * In-memory `KeywordRepository` — the LIVE binding until the persistence
 * todo wires Postgres (same pattern as the backend `DATABASE_ENABLED=false`
 * mode). Creation order is preserved for deterministic matching.
 */
@Injectable()
export class InMemoryKeywordRepository extends KeywordRepository {
  private readonly store = new Map<string, Keyword>();

  public async findAll(): Promise<ReadonlyArray<Keyword>> {
    return [...this.store.values()];
  }

  public async findEnabled(): Promise<ReadonlyArray<Keyword>> {
    return [...this.store.values()].filter((k) => k.enabled);
  }

  public async save(keyword: Keyword): Promise<void> {
    this.store.set(keyword.id, keyword);
  }

  public async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
