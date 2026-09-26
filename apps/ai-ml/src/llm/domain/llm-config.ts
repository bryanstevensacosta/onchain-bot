/**
 * LlmConfig (ai-ml, todo 0): the two switches ai-ml OWNS.
 *
 * Single-row shape (id=1 when persisted — TypeORM lands with the
 * prompts catalog in todo 1); in-memory adapter is live in v1.
 * `matching` is NOT here: it lives in the consumer and arrives as
 * input to `resolvePipelineFlags` (see pipeline-flags.ts).
 */
export interface LlmConfig {
  readonly llmEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly updatedAt: string;
}

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  llmEnabled: false,
  publishingEnabled: false,
  updatedAt: new Date(0).toISOString(),
};

export function validateLlmConfigPatch(patch: {
  llmEnabled?: unknown;
  publishingEnabled?: unknown;
}): { llmEnabled?: boolean; publishingEnabled?: boolean } {
  const out: { llmEnabled?: boolean; publishingEnabled?: boolean } = {};
  if (patch.llmEnabled !== undefined) {
    if (typeof patch.llmEnabled !== 'boolean') {
      throw new Error('llmEnabled must be a boolean');
    }
    out.llmEnabled = patch.llmEnabled;
  }
  if (patch.publishingEnabled !== undefined) {
    if (typeof patch.publishingEnabled !== 'boolean') {
      throw new Error('publishingEnabled must be a boolean');
    }
    out.publishingEnabled = patch.publishingEnabled;
  }
  return out;
}
