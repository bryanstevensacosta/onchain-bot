import { Kol } from 'telegram-kol/identity/domain/entities/kol.entity';
import { KolId } from 'telegram-kol/identity/domain/value-objects/kol-id.vo';

/**
 * Outbound port: persistence for Telegram KOLs.
 *
 * Implemented in infrastructure/repositories with the chosen storage.
 */
export abstract class KolRepository {
  public abstract save(kol: Kol): Promise<void>;
  public abstract findById(id: KolId): Promise<Kol | null>;
  public abstract findAll(): Promise<ReadonlyArray<Kol>>;
  public abstract delete(id: KolId): Promise<void>;

  /**
   * Patch the resolved display title for an existing KOL without
   * requiring a full save round-trip. Returns true if a KOL was found
   * and updated, false otherwise.
   *
   * Used by the seeder / post-connect backfill to replace the
   * "Telegram channel <peerId>" fallback once the MTProto session is
   * available and the real title can be resolved.
   */
  public abstract updateTitle(id: KolId, newTitle: string): Promise<boolean>;
}
