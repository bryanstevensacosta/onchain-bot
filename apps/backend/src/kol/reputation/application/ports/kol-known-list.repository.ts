/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL rating moved to
 * apps/kol-calls/src/tracking (TrackedMention + kol_window_stats +
 * GET /api/kol-rankings). Refactor target: delete this file at the
 * central FINAL REVIEW (C4-bis.3). Rollback: backend path stays wired.
 */
import type { KolKnownListKind } from 'kol/reputation/infrastructure/persistence/typeorm/entities/kol-known-list.entity';

/**
 * Persistence port for the kol_known_lists table.
 *
 * Used by the DB-backed KnownKolPort implementation
 * (DbBackedKnownKolRegistry). Future admin API will use this too
 * (add/remove/list operations).
 */
export abstract class KolKnownListRepository {
  public abstract isKnown(
    kolId: string,
    kind: KolKnownListKind,
  ): Promise<boolean>;
  public abstract list(kind: KolKnownListKind): Promise<
    ReadonlyArray<{
      kolId: string;
      reason: string | null;
      addedAt: Date;
    }>
  >;
}
