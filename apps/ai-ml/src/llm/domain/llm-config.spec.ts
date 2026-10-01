import { validateLlmConfigPatch } from './llm-config';

describe('validateLlmConfigPatch', () => {
  it('accepts boolean switches', () => {
    expect(validateLlmConfigPatch({ llmEnabled: true })).toEqual({
      llmEnabled: true,
    });
    expect(validateLlmConfigPatch({ publishingEnabled: false })).toEqual({
      publishingEnabled: false,
    });
  });

  it('rejects non-boolean switches', () => {
    expect(() => validateLlmConfigPatch({ llmEnabled: 'yes' })).toThrow(
      'llmEnabled must be a boolean',
    );
    expect(() => validateLlmConfigPatch({ publishingEnabled: 1 })).toThrow(
      'publishingEnabled must be a boolean',
    );
  });

  it('ignores unknown fields', () => {
    expect(validateLlmConfigPatch({ matching: true } as never)).toEqual({});
  });
});
