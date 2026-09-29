/**
 * Opaque cursor for keyset pagination over `GET /api/feed/messages`.
 *
 * The cursor encodes the last row of a page (`publishedAt` + `id`) as
 * base64url JSON. Clients treat it as opaque: they pass `nextCursor` back
 * as `?cursor=` to fetch the following page. Ordering is
 * `publishedAt DESC, id DESC`, so the tie-breaker keeps pages deterministic
 * even when several rows share a timestamp.
 *
 * Per Requirement: cursor only for history reads; the SSE realtime path is
 * untouched.
 */

import { BadRequestException } from '@nestjs/common';

export interface FeedCursor {
  readonly publishedAt: Date;
  readonly id: string;
}

export function encodeFeedCursor(
  publishedAt: Date | string,
  id: string,
): string {
  const iso =
    publishedAt instanceof Date ? publishedAt.toISOString() : publishedAt;
  const payload = JSON.stringify({ p: iso, i: id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeFeedCursor(cursor: string): FeedCursor {
  let parsed: unknown;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException(
      'Invalid cursor: must be an opaque cursor returned as nextCursor',
    );
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).p !== 'string' ||
    typeof (parsed as Record<string, unknown>).i !== 'string'
  ) {
    throw new BadRequestException(
      'Invalid cursor: must be an opaque cursor returned as nextCursor',
    );
  }
  const { p, i } = parsed as { p: string; i: string };
  if (p.length === 0 || i.length === 0 || Number.isNaN(Date.parse(p))) {
    throw new BadRequestException(
      'Invalid cursor: must be an opaque cursor returned as nextCursor',
    );
  }
  return { publishedAt: new Date(p), id: i };
}
