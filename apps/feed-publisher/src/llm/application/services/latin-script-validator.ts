/**
 * Pure-function validator: enforce Latin-script-only text on LLM output
 * before it is published to the feed channel (moved from backend
 * crypto-news-publisher, todo 5).
 *
 * The regex is the single source of truth — no blacklist, no
 * per-language allowlist, no normalization. The character class lets in:
 *   - \p{Script=Latin}     — A..Z, a..z, accented Latin (é, ñ, ü, ...),
 *                           precomposed + combining marks that are Inherited.
 *   - \p{Script=Common}    — digits, punctuation, currency symbols ($),
 *                           whitespace, and EMOJI (emoji are Common, not
 *                           their own script; skin-tone modifiers are
 *                           Common too).
 *   - \p{Script=Inherited} — combining diacritical marks (U+0301 etc.).
 *
 * Everything else (CJK, Hangul, Cyrillic, Greek, Arabic, Hebrew, ...) is
 * rejected, because LLM-generated text in those scripts has historically
 * been either a hallucinated ticker/copy or a leaked language the prompt
 * did not authorize.
 */
const NON_LATIN_RE = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/gu;

export interface NonLatinMatch {
  readonly char: string;
  readonly codePoint: number;
  readonly index: number;
}

export const findNonLatinCharacter = (text: string): NonLatinMatch | null => {
  NON_LATIN_RE.lastIndex = 0;
  const m = NON_LATIN_RE.exec(text);
  if (m === null) return null;
  return { char: m[0], codePoint: m[0].codePointAt(0)!, index: m.index };
};

export const isLatinScriptOnly = (text: string): boolean =>
  findNonLatinCharacter(text) === null;
