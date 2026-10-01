/**
 * EmojiMap validators (todo 5, dexter-message-templates).
 *
 * Pure functions — no Nest, no I/O. Mirrors the SHAPE of the sibling
 * `src/templates/domain/message-template.validators.ts` (todo 2): constants
 * + `validate*` functions throwing a local domain error. Dexter owns no
 * shared kernel `DomainError`, so the error classes live here.
 *
 * Closed key whitelist: the union of every known placeholder key across
 * all template commands (`PLACEHOLDERS_BY_COMMAND`). v1 seeds only `chain`
 * rows (seed data lands in todo 9, NOT here), but the validator stays open
 * to any whitelisted key so future keys (e.g. `tone`) need no code change.
 */

import {
  BASE_TOKEN_PLACEHOLDERS,
  DERIVED_PLACEHOLDERS,
  TIMEFRAME_PLACEHOLDER,
} from '@/placeholders/domain/placeholder-registry';

export const MIN_MATCH_VALUE_LENGTH = 1;
export const MAX_MATCH_VALUE_LENGTH = 40;
export const MIN_EMOJI_GRAPHEMES = 1;
export const MAX_EMOJI_GRAPHEMES = 8;

/** Every placeholder key an EmojiMap row may attach to (closed union). */
export const EMOJI_PLACEHOLDER_KEYS: readonly string[] = [
  ...BASE_TOKEN_PLACEHOLDERS,
  ...DERIVED_PLACEHOLDERS,
  TIMEFRAME_PLACEHOLDER,
];

export class EmojiMapValidationError extends Error {
  public readonly code = 'EMOJI_MAP_VALIDATION';
  public readonly details?: unknown;

  public constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'EmojiMapValidationError';
    this.details = details;
  }
}

/** Thrown when a (placeholderKey, matchValue) pair already exists. */
export class EmojiMapDuplicateError extends Error {
  public readonly code = 'EMOJI_MAP_DUPLICATE';
  public readonly details?: unknown;

  public constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'EmojiMapDuplicateError';
    this.details = details;
  }
}

const fail = (message: string, details?: unknown): never => {
  throw new EmojiMapValidationError(message, details);
};

const requireString = (raw: unknown, field: string): string => {
  if (typeof raw !== 'string') {
    fail(`EmojiMap ${field} must be a string`, { [field]: raw });
  }
  return raw as string;
};

export const validatePlaceholderKey = (raw: unknown): string => {
  const trimmed = requireString(raw, 'placeholderKey').trim();
  if (trimmed.length === 0) {
    fail('EmojiMap placeholderKey cannot be empty');
  }
  if (!(EMOJI_PLACEHOLDER_KEYS as readonly string[]).includes(trimmed)) {
    fail(
      `EmojiMap placeholderKey must be one of: ${EMOJI_PLACEHOLDER_KEYS.join(', ')}`,
      { placeholderKey: raw },
    );
  }
  return trimmed;
};

/**
 * Normalizes to lowercase-trimmed form. Resolution is case-insensitive by
 * construction (both write and read paths normalize the same way), so the
 * DB `@Unique(['placeholderKey','matchValue'])` naturally rejects
 * case-variant duplicates (`Solana` vs `solana`).
 */
export const validateMatchValue = (raw: unknown): string => {
  const trimmed = requireString(raw, 'matchValue').trim();
  if (trimmed.length < MIN_MATCH_VALUE_LENGTH) {
    fail('EmojiMap matchValue cannot be empty');
  }
  if (trimmed.length > MAX_MATCH_VALUE_LENGTH) {
    fail(`EmojiMap matchValue exceeds max length ${MAX_MATCH_VALUE_LENGTH}`, {
      length: trimmed.length,
      max: MAX_MATCH_VALUE_LENGTH,
    });
  }
  return trimmed.toLowerCase();
};

interface SegmenterLike {
  segment(input: string): Iterable<unknown>;
}

const countGraphemes = (value: string): number => {
  const maybeSegmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity?: string },
      ) => SegmenterLike;
    }
  ).Segmenter;
  if (typeof maybeSegmenter === 'function') {
    return [
      ...new maybeSegmenter(undefined, { granularity: 'grapheme' }).segment(
        value,
      ),
    ].length;
  }
  return [...value].length;
};

export const validateEmoji = (raw: unknown): string => {
  const trimmed = requireString(raw, 'emoji').trim();
  if (trimmed.length === 0) {
    fail('EmojiMap emoji cannot be empty');
  }
  const graphemes = countGraphemes(trimmed);
  if (graphemes < MIN_EMOJI_GRAPHEMES || graphemes > MAX_EMOJI_GRAPHEMES) {
    fail(
      `EmojiMap emoji must be ${MIN_EMOJI_GRAPHEMES}-${MAX_EMOJI_GRAPHEMES} graphemes`,
      { graphemes, min: MIN_EMOJI_GRAPHEMES, max: MAX_EMOJI_GRAPHEMES },
    );
  }
  return trimmed;
};
