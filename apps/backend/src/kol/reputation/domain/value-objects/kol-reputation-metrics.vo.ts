/**
 * KolReputationMetrics — the dynamic shape stored in `kol_reputations.metrics`
 * (jsonb column). Replaces the fixed `strongCalls` / `goodCalls` /
 * `neutralCalls` / `poorCalls` columns.
 *
 * Three groups:
 * 1. Raw outcome counts — populated as call/lifecycle emits events
 *    (will be 0 until INV-18 ships). Each count is the number of
 *    tracked calls that hit the respective multiple.
 * 2. Derived scores (0..1) — pre-computed blends for quick UI render.
 * 3. `totalMentions` — denominator used by quality/drawdown scores
 *    and by confidence.
 *
 * Why jsonb: outcome categories (X2, X5, X10, X50, rug-50, rug-80)
 * can be added/removed without schema migrations. The DB stores the
 * whole shape as JSON; the TypeScript type describes what we know
 * about today.
 */
export interface KolReputationMetrics {
  readonly totalMentions: number;

  // Outcome counts (populated when call/lifecycle emits events)
  readonly x2Count: number;
  readonly x5Count: number;
  readonly x10Count: number;
  readonly x50Count: number;
  readonly rug50Count: number;
  readonly rug80Count: number;
  readonly neutralCount: number;

  // Derived scores (0..1)
  readonly mentionScore: number;
  readonly qualityScore: number;
  readonly drawdownScore: number;
}

export const EMPTY_KOL_REPUTATION_METRICS: KolReputationMetrics = {
  totalMentions: 0,
  x2Count: 0,
  x5Count: 0,
  x10Count: 0,
  x50Count: 0,
  rug50Count: 0,
  rug80Count: 0,
  neutralCount: 0,
  mentionScore: 0.5,
  qualityScore: 0.5,
  drawdownScore: 0.5,
};
