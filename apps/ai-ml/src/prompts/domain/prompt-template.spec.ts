import { extractVariables, validatePromptInput } from './prompt-template';

/**
 * Failing-first domain spec (ai-ml todo 1): versioned global prompt
 * catalog. RED until `prompt-template.ts` exists.
 */
describe('prompt-template domain (todo 1)', () => {
  it('extracts {{variables}} from content + system content', () => {
    expect(
      extractVariables('Hello {{title}} — {{original}}', 'sys {{hasImage}}'),
    ).toEqual(['hasImage', 'original', 'title']);
  });

  it('dedupes and ignores empty placeholders', () => {
    expect(extractVariables('{{a}} {{a}} {{}} {{ b }}', '')).toEqual([
      'a',
      'b',
    ]);
  });

  it('rejects empty names and empty content', () => {
    expect(() =>
      validatePromptInput({ name: '  ', content: 'x', contentType: 'global' }),
    ).toThrow(/name/i);
    expect(() =>
      validatePromptInput({ name: 'ok', content: '  ', contentType: 'global' }),
    ).toThrow(/content/i);
  });

  it('rejects unknown contentType scopes', () => {
    expect(() =>
      validatePromptInput({ name: 'ok', content: 'x', contentType: 'nope' }),
    ).toThrow(/contentType/i);
  });

  it('defaults scope to global', () => {
    const out = validatePromptInput({ name: ' ok ', content: 'Hi {{who}}' });
    expect(out).toEqual({
      name: 'ok',
      content: 'Hi {{who}}',
      systemContent: '',
      contentType: 'global',
      variables: ['who'],
    });
  });
});
