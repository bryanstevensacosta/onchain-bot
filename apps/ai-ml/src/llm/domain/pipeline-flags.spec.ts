import { resolvePipelineFlags } from './pipeline-flags';

describe('resolvePipelineFlags (3-flag mirror)', () => {
  it('pauses everything when matching + publishing are off', () => {
    const r = resolvePipelineFlags({
      matching: false,
      llm: false,
      publishing: false,
    });
    expect(r.mode).toBe('all-paused');
    expect(r.llmActive).toBe(false);
  });

  it('drains raw when matching is off and publishing is on without llm', () => {
    const r = resolvePipelineFlags({
      matching: false,
      llm: false,
      publishing: true,
    });
    expect(r.mode).toBe('drain-raw');
    expect(r.llmActive).toBe(false);
  });

  it('drains with llm when matching is off and llm + publishing are on', () => {
    const r = resolvePipelineFlags({
      matching: false,
      llm: true,
      publishing: true,
    });
    expect(r.mode).toBe('drain-llm');
    expect(r.llmActive).toBe(true);
  });

  it('accumulates only when publishing is off (llm never active)', () => {
    for (const llm of [false, true]) {
      const r = resolvePipelineFlags({
        matching: true,
        llm,
        publishing: false,
      });
      expect(r.mode).toBe('enqueue-only');
      expect(r.llmActive).toBe(false);
    }
  });

  it('runs the raw pipeline when publishing without llm', () => {
    const r = resolvePipelineFlags({
      matching: true,
      llm: false,
      publishing: true,
    });
    expect(r.mode).toBe('raw-pipeline');
    expect(r.llmActive).toBe(false);
  });

  it('runs the full pipeline only when matching + llm + publishing are on', () => {
    const r = resolvePipelineFlags({
      matching: true,
      llm: true,
      publishing: true,
    });
    expect(r.mode).toBe('full-pipeline');
    expect(r.llmActive).toBe(true);
  });
});
