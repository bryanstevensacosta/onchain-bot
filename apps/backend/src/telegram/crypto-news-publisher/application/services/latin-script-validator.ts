/**
 * Pure-function validator: enforce Latin-script-only text on LLM output
 * before it is published to the VIP channel.
 *
 * The regex is the single source of truth — no blacklist, no per-language
 * allowlist, no normalization. The character class lets in:
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
 *
 * Flags:
 *   - `u` is OBLIGATORY. Without it, `\p{...}` throws SyntaxError at the
 *     first use of the literal.
 *   - `g` is OBLIGATORY. Without it, `text.match(re)` returns the first
 *     match as a string with no `.index` property — and we need `.index`
 *     to point at the offending character.
 *
 * The implementation file lives at
 *   apps/backend/src/telegram/crypto-news-publisher/application/services/latin-script-validator.ts
 * It is consumed by `process-next-queued-article.use-case.ts` (a later todo).
 */
const NON_LATIN_RE =
  /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/gu;

export interface NonLatinMatch {
  readonly char: string;
  readonly codePoint: number;
  readonly index: number;
}

export const findNonLatinCharacter = (text: string): NonLatinMatch | null => {
  // The /g flag is stateful via `re.lastIndex`. After a successful exec
  // the engine leaves `lastIndex` at the END of the match, so the next
  // call on the SAME regex would resume scanning from there — silently
  // missing earlier matches in shorter strings. We must reset to 0
  // before every call. This is the canonical workaround when sharing
  // a /g regex across calls; the alternative is `text.matchAll(...)` +
  // a manual `.next()` which costs an iterator allocation per call.
  // Using `re.exec` (not `text.match`) is required because `match` with
  // a /g regex returns an array of all matches, and that array has no
  // `.index` property — `.index` only appears on the result of `exec`.
  NON_LATIN_RE.lastIndex = 0;
  const m = NON_LATIN_RE.exec(text);
  if (m === null) return null;
  return { char: m[0], codePoint: m[0].codePointAt(0)!, index: m.index };
};

export const isLatinScriptOnly = (text: string): boolean =>
  findNonLatinCharacter(text) === null;
