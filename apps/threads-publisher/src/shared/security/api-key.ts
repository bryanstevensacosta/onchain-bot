export const API_KEY_HEADER = 'x-api-key';

/**
 * Fail-open when no key is configured (keyless dev).
 * Otherwise requires an exact match.
 */
export function isAuthorized(provided: unknown, expected: string): boolean {
  const want = (expected ?? '').trim();
  if (want.length === 0) {
    return true;
  }
  if (typeof provided !== 'string') {
    return false;
  }
  return provided.trim() === want;
}
