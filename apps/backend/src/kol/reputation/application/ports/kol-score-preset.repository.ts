/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL rating moved to
 * apps/kol-calls/src/tracking (TrackedMention + kol_window_stats +
 * GET /api/kol-rankings). Refactor target: delete this file at the
 * central FINAL REVIEW (C4-bis.3). Rollback: backend path stays wired.
 */
import type { KolScorePreset } from 'kol/reputation/domain/value-objects/kol-score-preset.vo';

/**
 * Persistence port for kol-score presets stored in `settings_presets`.
 *
 * Owns the read path for the operator-tunable kol/reputation value
 * set (whitelist multipliers, confidence thresholds, knownGoodScore,
 * outcome bucket thresholds, formula weights). See
 * `.omo/drafts/configurable-presets.md`.
 *
 * Slice A: read-only `getActive()`. Slice B will add scope-aware
 * `getActiveForScope(scope)` + list/create/update/delete.
 */
export abstract class KolScorePresetRepository {
  public abstract getActive(): Promise<KolScorePreset>;
}
