export const API_KEY_HEADER = 'x-api-key';

/** Exact-match check for the legacy single env key (admin-equivalent). */
export function isAuthorized(
  presented: string | undefined,
  expected: string,
): boolean {
  if (!presented || !expected) {
    return false;
  }
  return presented === expected;
}
