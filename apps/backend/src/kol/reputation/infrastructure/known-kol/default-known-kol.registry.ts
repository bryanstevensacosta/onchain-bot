import { Injectable, Logger } from '@nestjs/common';
import { KnownKolPort } from 'kol/reputation/application/ports/known-kol.port';
import { SettingsService } from 'settings/application/services/settings.service';

/**
 * Default implementation of `KnownKolPort`.
 *
 * Owns the operator-curated `KNOWN_GOOD` (default scores for trusted
 * KOLs) and `KNOWN_BAD` (hard-skip list) sets. Lives in
 * `infrastructure/known-kol/` because it is the concrete policy the
 * port exposes — different deployments could replace this with a
 * DB-backed registry without touching the scoring adapter.
 *
 * Reads from `SettingsService` (DB) at call time; falls back to
 * `FALLBACK_KNOWN_GOOD` / `FALLBACK_KNOWN_BAD` if the DB has no
 * rows (preserves pre-refactor behavior on a fresh DB).
 */
@Injectable()
export class DefaultKnownKolRegistry extends KnownKolPort {
  private readonly logger = new Logger(DefaultKnownKolRegistry.name);

  private static readonly FALLBACK_KNOWN_GOOD: Map<string, number> = new Map([
    ['spydefi', 0.95],
    ['whaleinsiders', 0.9],
    ['alpha_calls', 0.85],
    ['sol_calls', 0.85],
    ['defi_alpha_hub', 0.85],
    ['gem_finder', 0.8],
    ['onchainalpha', 0.9],
    ['smart_trader_calls', 0.85],
    ['pepe', 0.6],
  ]);

  private static readonly FALLBACK_KNOWN_BAD: Set<string> = new Set([
    'free_airdrop_spam',
    'pump_guaranteed',
  ]);

  public constructor(private readonly settings: SettingsService) {
    super();
  }

  public async getGoodScore(kolId: string): Promise<number | null> {
    const { good } = await this.settings.getKnownKOLs();
    if (good.size > 0) {
      return good.get(kolId.toLowerCase()) ?? null;
    }
    this.logger.warn('Settings fallback: KNOWN_GOOD (DB empty)');
    return (
      DefaultKnownKolRegistry.FALLBACK_KNOWN_GOOD.get(kolId.toLowerCase()) ??
      null
    );
  }

  public async isBad(kolId: string): Promise<boolean> {
    const { bad } = await this.settings.getKnownKOLs();
    if (bad.size > 0) {
      return bad.has(kolId.toLowerCase());
    }
    this.logger.warn('Settings fallback: KNOWN_BAD (DB empty)');
    return DefaultKnownKolRegistry.FALLBACK_KNOWN_BAD.has(kolId.toLowerCase());
  }
}
