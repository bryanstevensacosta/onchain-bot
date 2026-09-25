export interface PipelineFlagInput {
  readonly matching: boolean;
  readonly llm: boolean;
  readonly publishing: boolean;
}

export type PipelineMode =
  | 'all-paused'
  | 'drain-raw'
  | 'drain-llm'
  | 'enqueue-only'
  | 'raw-pipeline'
  | 'full-pipeline';

export interface ResolvedPipelineFlags {
  readonly flags: PipelineFlagInput;
  /** True only when llm AND publishing are on (C-FLAGS-01). */
  readonly llmActive: boolean;
  readonly mode: PipelineMode;
}

/**
 * Pure 3-flag resolver (C-FLAGS-01).
 *
 * matching comes from `MatchingConfig` (matching module); llm +
 * publishing from `LlmConfig` (this module). LLM generation runs ONLY
 * when llm AND publishing are on — with publishing off the queue only
 * accumulates, so generating would burn provider calls for nothing.
 */
export const resolvePipelineFlags = (
  input: PipelineFlagInput,
): ResolvedPipelineFlags => {
  const llmActive = input.llm && input.publishing;
  let mode: PipelineMode;
  if (!input.matching && !input.publishing) {
    mode = 'all-paused';
  } else if (!input.matching) {
    mode = llmActive ? 'drain-llm' : 'drain-raw';
  } else if (!input.publishing) {
    mode = 'enqueue-only';
  } else {
    mode = llmActive ? 'full-pipeline' : 'raw-pipeline';
  }
  return {
    flags: { matching: input.matching, llm: input.llm, publishing: input.publishing },
    llmActive,
    mode,
  };
};
