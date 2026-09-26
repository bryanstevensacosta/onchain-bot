import { MentionSnapshot } from '../../domain/entities/mention-snapshot.entity';

/**
 * MentionSnapshotRepository — storage port OWNED by `src/snapshot/` (P27).
 *
 * Same kol-calls DB as the mention index (joins mention<->snapshot stay
 * local, single-transaction atomicity); a split (timescale/partition) is a
 * later phase only if volume demands it. Today the wiring is in-memory;
 * the TypeORM entity + migration land with the persistence todo.
 */
export abstract class MentionSnapshotRepository {
  public abstract save(snapshot: MentionSnapshot): Promise<void>;
  public abstract findByMentionId(
    mentionId: string,
  ): Promise<MentionSnapshot | null>;
  public abstract count(): Promise<number>;
  /** P51 contract read: paginated list in stable insertion order. */
  public abstract findPaged(
    limit: number,
    offset: number,
  ): Promise<ReadonlyArray<MentionSnapshot>>;
}
