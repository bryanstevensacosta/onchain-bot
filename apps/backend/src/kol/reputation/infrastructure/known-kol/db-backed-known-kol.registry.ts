import { Injectable } from '@nestjs/common';
import { KnownKolPort } from 'kol/reputation/application/ports/known-kol.port';
import { KolKnownListRepository } from 'kol/reputation/application/ports/kol-known-list.repository';

/**
 * DB-backed implementation of `KnownKolPort`.
 *
 * Reads the operator-curated `KNOWN_GOOD` / `KNOWN_BAD` KOL lists from
 * the `kol_known_lists` table. The two entries seeded by the migration
 * (1883929251, 1992057930) match the previous `DefaultKnownKolRegistry`
 * fallback, so the leaderboard behaves identically.
 *
 * Why a new table vs reusing `SettingsService`:
 *   - `kol_known_lists` is KOL-scoped, not settings-wide. Each row is
 *     one KOL classification with reason + evidence + operator — first
 *     class audit trail.
 *   - The SettingsService path is kept for global toggles
 *     (settings_presets) but KOL whitelisting is its own concern.
 *   - Admin API surface (planned): `POST /kol/whitelist`,
 *     `DELETE /kol/whitelist/:kolId`. Trivially maps to this table.
 */
@Injectable()
export class DbBackedKnownKolRegistry extends KnownKolPort {
  private static readonly DEFAULT_GOOD_SCORE = 0.9;

  public constructor(
    private readonly repo: KolKnownListRepository,
  ) {
    super();
  }

  public async getGoodScore(kolId: string): Promise<number | null> {
    const isGood = await this.repo.isKnown(kolId, 'GOOD');
    if (!isGood) {
      return null;
    }
    return DbBackedKnownKolRegistry.DEFAULT_GOOD_SCORE;
  }

  public async isBad(kolId: string): Promise<boolean> {
    return this.repo.isKnown(kolId, 'BAD');
  }
}