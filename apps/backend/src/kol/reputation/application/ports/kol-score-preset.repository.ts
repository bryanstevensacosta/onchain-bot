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
