/**
 * DisplayMap validators (dexter-message-templates, display-catalog rename).
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
 *
 * Display values are arbitrary short strings (text, emoji, or both —
 * e.g. `SOL`, `🟣`, `🟣 SOL`), so the limit is a plain 1–40 char length
 * (NOT graphemes).
 */

import {
  BASE_TOKEN_PLACEHOLDERS,
  DERIVED_PLACEHOLDERS,
  TIMEFRAME_PLACEHOLDER,
} from '@/placeholders/domain/placeholder-registry';

export const MIN_MATCH_VALUE_LENGTH = 1;
export const MAX_MATCH_VALUE_LENGTH = 40;
export const MIN_DISPLAY_LENGTH = 1;
export const MAX_DISPLAY_LENGTH = 40;

/** Every placeholder key a DisplayMap row may attach to (closed union). */
export const DISPLAY_PLACEHOLDER_KEYS: readonly string[] = [
  ...BASE_TOKEN_PLACEHOLDERS,
  ...DERIVED_PLACEHOLDERS,
  TIMEFRAME_PLACEHOLDER,
];

export class DisplayMapValidationError extends Error {
  public readonly code = 'DISPLAY_MAP_VALIDATION';
  public readonly details?: unknown;

  public constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'DisplayMapValidationError';
    this.details = details;
  }
}

/** Thrown when a (placeholderKey, matchValue) pair already exists. */
export class DisplayMapDuplicateError extends Error {
  public readonly code = 'DISPLAY_MAP_DUPLICATE';
  public readonly details?: unknown;

  public constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'DisplayMapDuplicateError';
    this.details = details;
  }
}

const fail = (message: string, details?: unknown): never => {
  throw new DisplayMapValidationError(message, details);
};

const requireString = (raw: unknown, field: string): string => {
  if (typeof raw !== 'string') {
    fail(`DisplayMap ${field} must be a string`, { [field]: raw });
  }
  return raw as string;
};

export const validatePlaceholderKey = (raw: unknown): string => {
  const trimmed = requireString(raw, 'placeholderKey').trim();
  if (trimmed.length === 0) {
    fail('DisplayMap placeholderKey cannot be empty');
  }
  if (!DISPLAY_PLACEHOLDER_KEYS.includes(trimmed)) {
    fail(
      `DisplayMap placeholderKey must be one of: ${DISPLAY_PLACEHOLDER_KEYS.join(', ')}`,
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
    fail('DisplayMap matchValue cannot be empty');
  }
  if (trimmed.length > MAX_MATCH_VALUE_LENGTH) {
    fail(`DisplayMap matchValue exceeds max length ${MAX_MATCH_VALUE_LENGTH}`, {
      length: trimmed.length,
      max: MAX_MATCH_VALUE_LENGTH,
    });
  }
  return trimmed.toLowerCase();
};

export const validateDisplay = (raw: unknown): string => {
  const trimmed = requireString(raw, 'display').trim();
  if (trimmed.length < MIN_DISPLAY_LENGTH) {
    fail('DisplayMap display cannot be empty');
  }
  if (trimmed.length > MAX_DISPLAY_LENGTH) {
    fail(`DisplayMap display exceeds max length ${MAX_DISPLAY_LENGTH}`, {
      length: trimmed.length,
      max: MAX_DISPLAY_LENGTH,
    });
  }
  return trimmed;
};
