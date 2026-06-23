/**
 * Outbound port: static lookup of KOLs with pre-baked reputation.
 *
 * Owns the operator-curated `KNOWN_GOOD` / `KNOWN_BAD` lists. Defined as
 * a port so the scoring adapter can depend on the contract without
 * importing the concrete registry (which lives in
 * `telegram-kol/reputation/infrastructure/known-kol/`).
 *
 * Resolution order (highest priority first):
 *   1. KNOWN_BAD → 0.1 (always)
 *   2. KNOWN_GOOD → static default
 *   3. (caller falls back to KolReputationRepository for historical data)
 *   4. (caller falls back to 0.5 = unknown)
 *
 * KNOWN_BAD overrides real stats — a known scammer stays a scammer
 * regardless of past performance.
 */
export abstract class KnownKolPort {
  public abstract getGoodScore(kolId: string): number | null;
  public abstract isBad(kolId: string): boolean;
}
