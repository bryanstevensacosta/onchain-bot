import { Injectable } from '@nestjs/common';
import { MentionSnapshot } from '../../domain/entities/mention-snapshot.entity';
import { MentionSnapshotRepository } from '../../application/ports/mention-snapshot.repository';

/**
 * In-memory `MentionSnapshotRepository` (Tramo 1 stand-in; the TypeORM
 * entity + migration land with the persistence todo).
 *
 * Upsert by mentionId = double-delivery guard (P1, same pattern as the
 * extraction/parsing/normalization repos): realtime + catch-up re-delivery
 * overwrites the same row.
 */
@Injectable()
export class InMemoryMentionSnapshotRepository extends MentionSnapshotRepository {
  private readonly rows = new Map<string, MentionSnapshot>();

  public async save(snapshot: MentionSnapshot): Promise<void> {
    this.rows.set(snapshot.id, snapshot);
  }

  public async findByMentionId(
    mentionId: string,
  ): Promise<MentionSnapshot | null> {
    return this.rows.get(mentionId) ?? null;
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }
}
