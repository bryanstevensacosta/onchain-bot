/**
 * API-key helpers (Tramo 2, todo 1).
 *
 * Shared contract for x-api-key auth: outbound clients SEND the key
 * (INGESTION_TELEGRAM_API_KEY on SSE + feed reads, P30 day-one rule),
 * the ApiKeyGuard CHECKS the inbound key (SCHEDULING_POSTS_API_KEY).
 * Empty expected key = fail-open (keyless dev), mirroring the backend
 * feed-identity contract and the sibling extraction service.
 */
export const API_KEY_HEADER = 'x-api-key';

export function isAuthorized(
  provided: unknown,
  expected: string | undefined,
): boolean {
  const normalized = (expected ?? '').trim();
  if (normalized === '') {
    return true;
  }
  return typeof provided === 'string' && provided === normalized;
}
