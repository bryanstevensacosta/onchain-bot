/**
 * API-key helpers (Tramo 3, todo 1, P30 day-one rule).
 *
 * Shared x-api-key contract: consumers SEND the key, the ApiKeyGuard
 * CHECKS the inbound key (MARKET_DATA_API_KEY). Empty expected key =
 * fail-open (keyless dev), mirroring the sibling extraction services.
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
