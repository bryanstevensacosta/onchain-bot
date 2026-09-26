import type { TrackedMention } from '../../domain/entities/tracked-mention.entity';

/**
 * Storage port for (kol, contract) first-seen trackers (same kol-calls
 * DB; in-memory today — TypeORM entity + migration land with the
 * persistence todo).
 *
 * Upsert by `kolId:chain:address` = double-delivery guard (P1, same
 * pattern as the extraction/parsing/normalization/scoring repos).
 */
export abstract class TrackedMentionRepository {
  public abstract save(tracked: TrackedMention): Promise<void>;
  public abstract findByKolContract(
    kolId: string,
    chain: string,
    address: string,
  ): Promise<TrackedMention | null>;
  public abstract findAll(): Promise<TrackedMention[]>;
  public abstract count(): Promise<number>;
}
