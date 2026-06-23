import { KolReputation } from 'telegram-kol/reputation/domain/value-objects/kol-reputation.vo';

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
