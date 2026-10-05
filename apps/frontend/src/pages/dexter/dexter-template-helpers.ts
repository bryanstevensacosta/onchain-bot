import { HttpError } from '@/shared/api/http-client';

/**
 * Shared helpers for the dexter template-management UI (`pages/dexter/`).
 * Pure presentation logic only — the data API lives in Lane A
 * (`@/entities/dexter`, frozen).
 */

/** Closed v1 command enum (mirrors backend `TEMPLATE_COMMANDS`). */
export const DEXTER_COMMANDS = ['ca', 'x', 'z', 'c', 'cc', 'bare'] as const;

export type DexterCommand = (typeof DEXTER_COMMANDS)[number];

/** Valid chart timeframes (mirrors backend `VALID_TIMEFRAMES`). */
export const DEXTER_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

export const TIMEFRAME_COMMANDS: ReadonlyArray<string> = ['c', 'cc'];

interface ExtractedError {
  readonly error: string;
  readonly valid: ReadonlyArray<string>;
}

/**
 * Pull `{error, valid}` out of an `HttpError.body`. The body is usually a
 * JSON string shaped `{"message":{"error":"…","valid":[…]},"statusCode":…}`
 * (Nest wraps object throws), `{"message":"…","statusCode":…}`, or plain
 * text. Never throws — falls back to `err.message`.
 */
export function extractDexterErrorBody(err: unknown): ExtractedError {
  const fallback =
    err instanceof Error ? err.message : 'Unexpected dexter service error';
  if (!(err instanceof HttpError)) {
    return { error: fallback, valid: [] };
  }
  const raw = typeof err.body === 'string' ? err.body : '';
  if (raw.length === 0) return { error: err.message, valid: [] };
  try {
    const parsed = JSON.parse(raw) as {
      message?: unknown;
      error?: unknown;
    };
    const message = parsed.message;
    if (
      typeof message === 'object' &&
      message !== null &&
      'error' in message &&
      typeof (message as { error: unknown }).error === 'string'
    ) {
      const shaped = message as { error: string; valid?: unknown };
      return {
        error: shaped.error,
        valid: Array.isArray(shaped.valid)
          ? shaped.valid.filter((v): v is string => typeof v === 'string')
          : [],
      };
    }
    if (typeof message === 'string' && message.length > 0) {
      return { error: message, valid: [] };
    }
    if (typeof parsed.error === 'string') {
      return { error: parsed.error, valid: [] };
    }
  } catch {
    return { error: raw, valid: [] };
  }
  return { error: err.message, valid: [] };
}

/**
 * Map a mutation failure to an English operator message. 409 (duplicate /
 * active / last) and 400 (unknown placeholder + `valid` list, immutable
 * command, XOR, timeframe) get distinct messages; anything else falls
 * back to the raw backend text.
 */
export function englishMutationError(err: unknown): string {
  const { error, valid } = extractDexterErrorBody(err);
  const status = err instanceof HttpError ? err.status : 0;

  if (/already exists/i.test(error)) {
    return 'A template with that name already exists for this command.';
  }
  if (/is active/i.test(error)) {
    return 'Cannot delete: the template is active. Activate another template of the same command first.';
  }
  if (/last template/i.test(error)) {
    return 'Cannot delete: it is the last template of the command. Create a replacement first.';
  }
  if (/Unknown placeholder/i.test(error)) {
    const match = error.match(/\{\{(\w+)\}\}/);
    const hint = valid.length > 0 ? ` Valid: ${valid.join(', ')}.` : '';
    return `Unknown placeholder${match ? ` {{${match[1]}}}` : ''}.${hint}`;
  }
  if (/immutable/i.test(error)) {
    return 'Command is immutable (delete and recreate to move commands).';
  }
  if (/exactly one of templateId or draft/i.test(error)) {
    return 'Pick a template or a draft, not both (nor neither).';
  }
  if (/timeframe is only valid/i.test(error)) {
    return 'Timeframe is only valid for c/cc templates.';
  }
  if (/Invalid timeframe/i.test(error)) {
    const hint = valid.length > 0 ? ` Valid: ${valid.join(', ')}.` : '';
    return `Invalid timeframe.${hint}`;
  }
  if (/not found/i.test(error)) {
    return 'Not found — did another operator delete it? Reload the list.';
  }
  if (status === 409) return `Dexter service conflict: ${error}`;
  if (status === 400) return `Request rejected: ${error}`;
  return error;
}
