import {
  AI_ML_DEFAULT_BASE_URL,
  DEFAULT_AI_ML_MODE,
  resolveAiMlBaseUrl,
  resolveAiMlMode,
} from './ai-ml-mode';

describe('resolveAiMlMode', () => {
  it('defaults to dual when unset, empty, or unknown (fail-safe: parity runs, local serves)', () => {
    expect(DEFAULT_AI_ML_MODE).toBe('dual');
    expect(resolveAiMlMode(undefined)).toBe('dual');
    expect(resolveAiMlMode('')).toBe('dual');
    expect(resolveAiMlMode('gateway')).toBe('dual');
    expect(resolveAiMlMode('LOCAL ')).toBe('local');
  });

  it('resolves the three modes case-insensitively', () => {
    expect(resolveAiMlMode('local')).toBe('local');
    expect(resolveAiMlMode('dual')).toBe('dual');
    expect(resolveAiMlMode('ai-ml')).toBe('ai-ml');
    expect(resolveAiMlMode('AI-ML')).toBe('ai-ml');
  });
});

describe('resolveAiMlBaseUrl', () => {
  it('defaults to loopback :4090 and trims trailing slashes', () => {
    expect(AI_ML_DEFAULT_BASE_URL).toBe('http://127.0.0.1:4090');
    expect(resolveAiMlBaseUrl(undefined)).toBe('http://127.0.0.1:4090');
    expect(resolveAiMlBaseUrl('')).toBe('http://127.0.0.1:4090');
    expect(resolveAiMlBaseUrl('http://127.0.0.1:4090///')).toBe(
      'http://127.0.0.1:4090',
    );
  });
});
