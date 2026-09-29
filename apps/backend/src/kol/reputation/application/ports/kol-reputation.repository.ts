/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL rating moved to
 * apps/kol-calls/src/tracking (TrackedMention + kol_window_stats +
 * GET /api/kol-rankings). Refactor target: delete this file at the
 * central FINAL REVIEW (C4-bis.3). Rollback: backend path stays wired.
 */
import { KolReputation } from 'kol/reputation/domain/value-objects/kol-reputation.vo';

/**
 * Outbound port: persistence for KolReputation aggregates.
 *
 * One record per KOL, keyed by `kolId`.
 */
export abstract class KolReputationRepository {
  public abstract save(stats: KolReputation): Promise<void>;
  public abstract findByKol(kolId: string): Promise<KolReputation | null>;
  /**
   * Batch lookup. Implementations should hit the storage in a single
   * round-trip (WHERE kol_id IN (...) for SQL, single Map scan in-memory)
   * rather than N parallel `findByKol` calls. Used by hot paths that need
   * reputations for a list of KOLs (e.g. scoring's avg multiplier).
   */
  public abstract findByIds(
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<KolReputation>>;
  public abstract findAll(): Promise<ReadonlyArray<KolReputation>>;
  public abstract findTop(
    limit: number,
    minConfidence?: KolReputation['confidence'],
  ): Promise<ReadonlyArray<KolReputation>>;
}
