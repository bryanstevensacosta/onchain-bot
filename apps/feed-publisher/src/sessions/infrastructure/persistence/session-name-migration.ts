import {
  SESSION_NAME_MAX_LENGTH,
  defaultSessionName,
} from '@/sessions/domain/entities/publishing-session.entity';

export interface LegacySessionRow {
  readonly id: string;
  readonly name: unknown;
  readonly templateName?: unknown;
}

/**
 * Backfill display names for rows that predate the session `name`
 * contract (empty/missing/overlong values).
 *
 * Rule: empty or missing -> `<template-name|ad-hoc>-<n>` (n = 1-based
 * row position); overlong -> trimmed to the max; duplicates are kept
 * (names are labels, ids stay unique). Returns the patched rows plus
 * the count of touched rows.
 *
 * Future TypeORM wiring (GAP-1): `name VARCHAR(80) NOT NULL` with
 * `DEFAULT 'ad-hoc-1'`; existing rows run through this function before
 * the NOT NULL constraint lands:
 * `UPDATE feed_sessions SET name = 'ad-hoc-' || row_number WHERE name
 * IS NULL OR btrim(name) = ''`.
 */
export function backfillSessionNames(rows: ReadonlyArray<LegacySessionRow>): {
  rows: Array<{ id: string; name: string }>;
  touched: number;
} {
  let touched = 0;
  const patched = rows.map((row, index) => {
    const current = typeof row.name === 'string' ? row.name.trim() : '';
    if (current.length > 0 && current.length <= SESSION_NAME_MAX_LENGTH) {
      return { id: row.id, name: current };
    }
    touched += 1;
    const templateName =
      typeof row.templateName === 'string' ? row.templateName : null;
    return {
      id: row.id,
      name: defaultSessionName(templateName, index + 1),
    };
  });
  return { rows: patched, touched };
}
