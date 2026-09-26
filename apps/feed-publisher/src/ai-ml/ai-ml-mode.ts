/**
 * Cutover flag for the ai-ml migration (ai-ml plan todo 4 cutover).
 *
 * `FEED_AI_ML_MODE` (default `ai-ml` since todo 4):
 * - `local` = legacy in-process adapters only (rollback position;
 *   set explicitly to roll back, divergence never auto-rolls back).
 * - `dual` = local + ai-ml legs run side by side, outcomes compared
 *   via `AiMlParityService`, the LOCAL leg serves (rollback/shadow).
 * - `ai-ml` = ai-ml over HTTP only, fail-closed (DEFAULT — local
 *   code is deprecated, dual-leg only, removal planned).
 *
 * Unknown values fall back to `ai-ml` (fail-closed: remote serves
 * or throws loudly, never silent-local).
 */
export type AiMlMode = 'local' | 'dual' | 'ai-ml';

export const DEFAULT_AI_ML_MODE: AiMlMode = 'ai-ml';

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
