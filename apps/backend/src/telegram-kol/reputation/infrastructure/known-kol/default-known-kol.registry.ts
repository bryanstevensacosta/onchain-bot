import { Injectable } from '@nestjs/common';
import { KnownKolPort } from 'telegram-kol/reputation/application/ports/known-kol.port';

/**
 * Default implementation of `KnownKolPort`.
 *
 * Owns the operator-curated `KNOWN_GOOD` (default scores for trusted
 * KOLs) and `KNOWN_BAD` (hard-skip list) sets. Lives in
 * `infrastructure/known-kol/` because it is the concrete policy the
 * port exposes — different deployments could replace this with a
 * DB-backed registry without touching the scoring adapter.
 *
 * Move KOLs off these lists by tracking them in the DB (`kol_reputations`)
 * — the adapter checks this registry first, then falls back to the repo.
 */
@Injectable()
export class DefaultKnownKolRegistry extends KnownKolPort {
  private static readonly KNOWN_GOOD: Map<string, number> = new Map([
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

  private static readonly KNOWN_BAD: Set<string> = new Set([
    'free_airdrop_spam',
    'pump_guaranteed',
  ]);

  public getGoodScore(kolId: string): number | null {
    return DefaultKnownKolRegistry.KNOWN_GOOD.get(kolId.toLowerCase()) ?? null;
  }

  public isBad(kolId: string): boolean {
    return DefaultKnownKolRegistry.KNOWN_BAD.has(kolId.toLowerCase());
  }
}
