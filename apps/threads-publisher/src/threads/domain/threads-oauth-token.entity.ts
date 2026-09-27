/**
 * OAuth token row (id=1): Meta Threads long-lived token (60d).
 * Token NEVER logged; mask *** outside this module.
 */
export interface ThreadsOAuthToken {
  readonly id: number;
  readonly accessToken: string;
  readonly threadsUserId: string;
  readonly obtainedAt: Date;
  readonly expiresInS: number;
}

export function isTokenExpiringSoon(
  token: ThreadsOAuthToken,
  now: Date = new Date(),
): boolean {
  const expiresAt = token.obtainedAt.getTime() + token.expiresInS * 1000;
  const sevenDaysMs = 7 * 24 * 3600 * 1000;
  return expiresAt - now.getTime() < sevenDaysMs;
}
