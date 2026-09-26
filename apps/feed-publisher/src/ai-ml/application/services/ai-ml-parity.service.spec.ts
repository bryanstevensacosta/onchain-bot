import { ConflictException } from '@nestjs/common';
import { AiMlParityService } from './ai-ml-parity.service';

describe('AiMlParityService', () => {
  it('starts empty with zero divergences', () => {
    const parity = new AiMlParityService();
    expect(parity.summary().diverged).toBe(0);
    expect(parity.summary().compared).toBe(0);
    expect(() => parity.assertNoDivergence()).not.toThrow();
  });

  it('compareLlmTexts matches byte-identical mock output', () => {
    const parity = new AiMlParityService();
    const text = '[LLM MOCK] Generated text for: hello';
    expect(
      parity.compareLlmTexts(text, text, { mockMode: true }),
    ).toBe('matched');
  });

  it('compareLlmTexts diverges on mock drift (same algorithm must agree)', () => {
    const parity = new AiMlParityService();
    expect(
      parity.compareLlmTexts('mock-a', 'mock-b', { mockMode: true }),
    ).toBe('diverged');
  });

  it('compareLlmTexts matches outcome-level for real providers (both non-empty)', () => {
    const parity = new AiMlParityService();
    expect(parity.compareLlmTexts('rewrite one', 'rewrite two', {})).toBe(
      'matched',
    );
  });

  it('compareLlmTexts diverges when exactly one side is empty or missing', () => {
    const parity = new AiMlParityService();
    expect(parity.compareLlmTexts('text', '', {})).toBe('diverged');
    expect(parity.compareLlmTexts('', 'text', {})).toBe('diverged');
    expect(parity.compareLlmTexts(null, 'text', {})).toBe('diverged');
    expect(parity.compareLlmTexts('text', null, {})).toBe('diverged');
  });

  it('compareLlmTexts matches when both sides fail (same outcome class)', () => {
    const parity = new AiMlParityService();
    expect(parity.compareLlmTexts(null, null, {})).toBe('matched');
  });

  it('compareEmbeddings matches identical vectors and near-identical cosine', () => {
    const parity = new AiMlParityService();
    const vector = [1, 0, 0];
    expect(parity.compareEmbeddings(vector, [...vector])).toBe('matched');
    expect(parity.compareEmbeddings([1, 0], [1, 0.0001])).toBe('matched');
  });

  it('compareEmbeddings diverges on dimension mismatch, null split, or distance', () => {
    const parity = new AiMlParityService();
    expect(parity.compareEmbeddings([1, 0], [1, 0, 0])).toBe('diverged');
    expect(parity.compareEmbeddings([1, 0], null)).toBe('diverged');
    expect(parity.compareEmbeddings(null, [1, 0])).toBe('diverged');
    expect(parity.compareEmbeddings([1, 0], [0, 1])).toBe('diverged');
    expect(parity.compareEmbeddings(null, null)).toBe('matched');
  });

  it('comparePrompts matches on trimmed content equality, diverges on drift', () => {
    const parity = new AiMlParityService();
    const local = { content: 'Rewrite {{original}}', systemContent: 'Editor' };
    expect(parity.comparePrompts(local, { ...local })).toBe('matched');
    expect(
      parity.comparePrompts(local, { ...local, content: 'Other' }),
    ).toBe('diverged');
    expect(parity.comparePrompts(local, null)).toBe('diverged');
    expect(parity.comparePrompts(null, null)).toBe('matched');
  });

  it('records per-leg ledgers and assertNoDivergence throws CONFLICT on divergence', () => {
    const parity = new AiMlParityService();
    parity.recordLlm('matched');
    parity.recordEmbedding('skipped');
    parity.recordPrompt('matched');
    expect(parity.summary().compared).toBe(2);
    expect(() => parity.assertNoDivergence()).not.toThrow();
    parity.recordLlm('diverged', 'local ok, remote empty');
    expect(parity.summary().diverged).toBe(1);
    expect(() => parity.assertNoDivergence()).toThrow(ConflictException);
  });
});
