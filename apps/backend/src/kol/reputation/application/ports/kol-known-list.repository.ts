import type { KolKnownListKind } from 'kol/reputation/infrastructure/persistence/typeorm/entities/kol-known-list.entity';

/**
 * Persistence port for the kol_known_lists table.
 *
 * Used by the DB-backed KnownKolPort implementation
 * (DbBackedKnownKolRegistry). Future admin API will use this too
 * (add/remove/list operations).
 */
export abstract class KolKnownListRepository {
  public abstract isKnown(kolId: string, kind: KolKnownListKind): Promise<boolean>;
  public abstract list(kind: KolKnownListKind): Promise<ReadonlyArray<{
    kolId: string;
    reason: string | null;
    addedAt: Date;
  }>>;
}