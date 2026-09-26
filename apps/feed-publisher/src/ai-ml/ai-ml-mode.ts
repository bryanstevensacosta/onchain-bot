/**
 * Cutover flag for the ai-ml migration (ai-ml plan todo 3).
 *
 * `FEED_AI_ML_MODE` (default `dual`):
 * - `local` = legacy in-process adapters only (rollback position).
 * - `dual` = local + ai-ml legs run side by side, outcomes compared
 *   via `AiMlParityService`, the LOCAL leg serves (no behavior change).
 * - `ai-ml` = ai-ml over HTTP only, fail-closed (cutover rehearsal;
 *   blocked while `assertNoDivergence` reports divergences).
 *
 * Unknown values fall back to `dual` (parity runs, local serves).
 */
export type AiMlMode = 'local' | 'dual' | 'ai-ml';

export const DEFAULT_AI_ML_MODE: AiMlMode = 'dual';

export const AI_ML_DEFAULT_BASE_URL = 'http://127.0.0.1:4090';

export const resolveAiMlMode = (raw?: string): AiMlMode => {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (normalized === 'local' || normalized === 'dual' || normalized === 'ai-ml') {
    return normalized;
  }
  return DEFAULT_AI_ML_MODE;
};

export const resolveAiMlBaseUrl = (raw?: string): string => {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : AI_ML_DEFAULT_BASE_URL;
};
