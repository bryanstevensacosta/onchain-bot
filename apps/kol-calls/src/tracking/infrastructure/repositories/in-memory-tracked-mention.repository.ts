import { Injectable } from '@nestjs/common';
import { TrackedMention } from '../../domain/entities/tracked-mention.entity';
import { TrackedMentionRepository } from '../../application/ports/tracked-mention.repository';

/**
 * In-memory `TrackedMentionRepository` (Tramo 1 stand-in; the TypeORM
 * entity + migration land with the persistence todo).
 *
 * Upsert by `kolId:chain:address` = double-delivery guard (P1).
 */
@Injectable()
export class InMemoryTrackedMentionRepository extends TrackedMentionRepository {
  private readonly rows = new Map<string, TrackedMention>();

  public async save(tracked: TrackedMention): Promise<void> {
    this.rows.set(tracked.id, tracked);
  }

  public async findByKolContract(
    kolId: string,
    chain: string,
    address: string,
  ): Promise<TrackedMention | null> {
    return (
      this.rows.get(TrackedMention.buildId(kolId, chain, address)) ?? null
    );
  }

  public async findAll(): Promise<TrackedMention[]> {
    return [...this.rows.values()];
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }
}
