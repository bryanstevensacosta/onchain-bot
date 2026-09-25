import { findNonLatinCharacter, isLatinScriptOnly } from './latin-script-validator';

describe('latin-script-validator', () => {
  it('accepts Latin text with accents, digits, punctuation and emoji', () => {
    expect(isLatinScriptOnly('Bitcoin sube un 5% 🚀 — ¿qué sigue, señor Muñoz?')).toBe(true);
    expect(isLatinScriptOnly('')).toBe(true);
  });

  it('rejects Cyrillic, CJK, Arabic and Greek with position info', () => {
    const cyrillic = findNonLatinCharacter('Hola мир');
    expect(cyrillic).not.toBeNull();
    expect(cyrillic!.char).toBe('м');
    expect(cyrillic!.index).toBe(5);
    expect(isLatinScriptOnly('价格上涨')).toBe(false);
    expect(isLatinScriptOnly('مرحبا')).toBe(false);
    expect(isLatinScriptOnly('αβγ')).toBe(false);
  });

  it('resets the shared regex between calls (no lastIndex leak)', () => {
    expect(findNonLatinCharacter('abc')).toBeNull();
    const hit = findNonLatinCharacter('abЖc');
    expect(hit).not.toBeNull();
    expect(hit!.index).toBe(2);
    expect(findNonLatinCharacter('abc')).toBeNull();
  });
});
