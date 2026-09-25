import { resolvePipelineFlags } from './pipeline-flags';

describe('resolvePipelineFlags (3-flag truth table)', () => {
  const cases: Array<{
    matching: boolean;
    llm: boolean;
    publishing: boolean;
    mode: string;
    llmActive: boolean;
  }> = [
    { matching: false, llm: false, publishing: false, mode: 'all-paused', llmActive: false },
    { matching: false, llm: false, publishing: true, mode: 'drain-raw', llmActive: false },
    { matching: false, llm: true, publishing: false, mode: 'all-paused', llmActive: false },
    { matching: false, llm: true, publishing: true, mode: 'drain-llm', llmActive: true },
    { matching: true, llm: false, publishing: false, mode: 'enqueue-only', llmActive: false },
    { matching: true, llm: false, publishing: true, mode: 'raw-pipeline', llmActive: false },
    { matching: true, llm: true, publishing: false, mode: 'enqueue-only', llmActive: false },
    { matching: true, llm: true, publishing: true, mode: 'full-pipeline', llmActive: true },
  ];

  it.each(cases)(
    'matching=$matching llm=$llm publishing=$publishing -> $mode (llmActive=$llmActive)',
    ({ matching, llm, publishing, mode, llmActive }) => {
      const resolved = resolvePipelineFlags({ matching, llm, publishing });
      expect(resolved.mode).toBe(mode);
      expect(resolved.llmActive).toBe(llmActive);
      expect(resolved.flags).toEqual({ matching, llm, publishing });
    },
  );

  it('never activates the LLM while publishing is off (cost guard)', () => {
    for (const llm of [false, true]) {
      for (const matching of [false, true]) {
        expect(
          resolvePipelineFlags({ matching, llm, publishing: false }).llmActive,
        ).toBe(false);
      }
    }
  });
});
