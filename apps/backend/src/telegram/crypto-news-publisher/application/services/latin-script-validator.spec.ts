import {
  findNonLatinCharacter,
  isLatinScriptOnly,
  type NonLatinMatch,
} from './latin-script-validator';

/**
 * Pure-function validator tests for Latin-script-only enforcement.
 *
 * Regex under test (lives in the implementation file):
 *   /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/gu
 *
 * Flags:
 *   - `u` is OBLIGATORY: without it `\p{...}` is a SyntaxError at runtime.
 *   - `g` is OBLIGATORY: without it `text.match(re)` returns the first
 *     match as a string (no `.index`), and we need `.index` to point at
 *     the offending character. (`codePointAt` is preferred over
 *     `charCodeAt` because the latter returns surrogate halves instead
 *     of the supplementary-plane code point.)
 */
describe('findNonLatinCharacter', () => {
  // (a) emoji ✨ is Script=Common; é is Latin → no non-Latin match
  it('returns null for emoji + Latin text with accented characters', () => {
    expect(findNonLatinCharacter('✨ BTC rompe $100k')).toBeNull();
  });

  // (b) plain Latin
  it('returns null for plain Latin ASCII', () => {
    expect(findNonLatinCharacter('Hola mundo')).toBeNull();
  });

  // (c) Chinese — first non-Latin char is '中' (U+4E2D = 20013) at index 4
  it('finds the first Chinese character with exact char/codePoint/index', () => {
    const m = findNonLatinCharacter('BTC 中文');
    expect(m).not.toBeNull();
    expect(m).toEqual<NonLatinMatch>({
      char: '中',
      codePoint: 20013,
      index: 4,
    });
  });

  // (d) Korean (Hangul)
  it('finds a Hangul (Korean) character', () => {
    const m = findNonLatinCharacter('안녕하세요');
    expect(m).not.toBeNull();
    expect(m!.char).toBe('안');
    // First char of '안녕하세요' is U+안D55C = 50572 (Hangul Syllable An)
    expect(m!.codePoint).toBeGreaterThan(0xac00);
    expect(m!.codePoint).toBeLessThan(0xd7a4);
    expect(m!.index).toBe(0);
  });

  // (e) Arabic
  it('finds an Arabic character', () => {
    const m = findNonLatinCharacter('مرحبا');
    expect(m).not.toBeNull();
    // First char 'م' is U+0643..0640 range (Arabic block)
    expect(m!.codePoint).toBeGreaterThanOrEqual(0x0600);
    expect(m!.codePoint).toBeLessThanOrEqual(0x06ff);
    expect(m!.index).toBe(0);
  });

  // (f) Cyrillic
  it('finds a Cyrillic character', () => {
    const m = findNonLatinCharacter('Привет');
    expect(m).not.toBeNull();
    // First char 'П' is U+041F = 1055
    expect(m!.codePoint).toBe(0x041f);
    expect(m!.index).toBe(0);
  });

  // (g) Hebrew
  it('finds a Hebrew character', () => {
    const m = findNonLatinCharacter('שלום');
    expect(m).not.toBeNull();
    // First char 'ש' is U+05E9 = 1513
    expect(m!.codePoint).toBe(0x05e9);
    expect(m!.index).toBe(0);
  });

  // (h) Greek
  it('finds a Greek character', () => {
    const m = findNonLatinCharacter('Γειά');
    expect(m).not.toBeNull();
    // First char 'Γ' is U+0393 = 915
    expect(m!.codePoint).toBe(0x0393);
    expect(m!.index).toBe(0);
  });

  // (i) empty string is NOT an error → null
  it('returns null for the empty string (empty content is not an error)', () => {
    expect(findNonLatinCharacter('')).toBeNull();
  });

  // (j) digits, $, and emoji are Common/Latin → no non-Latin match
  it('returns null for digits, currency symbol, and emoji', () => {
    expect(findNonLatinCharacter('100% $5,000 🚀🚀')).toBeNull();
  });

  // (k) 'café' — combining accent (U+0301) is Script=Inherited
  it('returns null for "café" (combining accent is Inherited, é is Latin)', () => {
    // Use the precomposed é (U+00E9 = 233) — both shapes are Latin/Inherited.
    expect(findNonLatinCharacter('café')).toBeNull();
  });

  // (l) emoji with skin-tone modifier: both base + modifier are Script=Common
  it('returns null for "👍🏽" (base + skin-tone modifier are both Script=Common)', () => {
    expect(findNonLatinCharacter('👍🏽')).toBeNull();
  });

  // (m) supplementary-plane code point encoded as a surrogate pair in JS.
  //     We use U+10000 (LINEAR B SYLLABLE B008 A, Script=Linear_B) — a
  //     genuinely non-Latin, non-Common supplementary-plane character.
  //     NB: U+1F004 (MAHJONG TILE RED DRAGON) is Script=Common in the
  //     Unicode database — same family as ✨ and 🚀 — so it is correctly
  //     accepted by the validator and cannot serve as a surrogate-pair
  //     rejection probe.
  //     This test locks surrogate-pair handling: `codePointAt` must
  //     return 0x10000, NOT the high-surrogate value 0xD800 (= 55296).
  it('finds a supplementary-plane code point encoded as a surrogate pair', () => {
    const probe = '\u{10000}';
    const m = findNonLatinCharacter(probe);
    expect(m).not.toBeNull();
    expect(m!.char).toBe(probe);
    expect(m!.codePoint).toBe(0x10000);
    expect(m!.index).toBe(0);
  });

  // (n) SMOKE TEST of regex compilation:
  //     A lost `u` flag throws SyntaxError on the FIRST call to the
  //     literal; neither tsc nor eslint catches this. Without this
  //     test, the regression is a silent runtime crash.
  it('does not throw on a plain ASCII string (locks regex compilation + u flag)', () => {
    expect(() => findNonLatinCharacter('a')).not.toThrow();
  });

  it('isLatinScriptOnly agrees with findNonLatinCharacter === null', () => {
    expect(isLatinScriptOnly('Hola mundo')).toBe(true);
    expect(isLatinScriptOnly('BTC 中文')).toBe(false);
    expect(isLatinScriptOnly('')).toBe(true);
    expect(isLatinScriptOnly('\u{10000}')).toBe(false);
  });
});
