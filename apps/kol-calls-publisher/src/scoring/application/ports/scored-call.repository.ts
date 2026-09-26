import type { ScoredCall } from '../../domain/entities/scored-call.entity';

/**
 * Persistence port for scored mentions (same kol-system DB; in-memory
 * today — TypeORM entity + migration land with the persistence todo).
 *
 * Only gate-passing mentions are saved (upsert by mentionId =
 * double-delivery guard, P1). Below-cut mentions are discarded
 * pre-publisher and never touch this port.
 */
export abstract class ScoredCallRepository {
  public abstract save(scored: ScoredCall): Promise<void>;
  public abstract findByMentionId(
    mentionId: string,
  ): Promise<ScoredCall | null>;
  public abstract findRecent(limit: number): Promise<ScoredCall[]>;
  public abstract count(): Promise<number>;
}
