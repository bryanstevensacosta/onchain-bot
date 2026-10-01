/**
 * @deprecated Moved to apps/feed-publisher/src/threads/ (Tramo 2, todo 8 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add threads logic in apps/feed-publisher/src/threads/ instead.
 */
/**
 * Minimal persistence contract for the singleton Threads OAuth token row.
 *
 * The refresher (`ThreadsTokenRefresher`) is the ONLY writer of
 * `threads_oauth_tokens` (always `id = 1`). The TypeORM-backed
 * implementation is wired by T4; until then the refresher runs with no
 * store (validates + refreshes in memory, skips persistence with a warn).
 */
export interface ThreadsOAuthTokenUpsert {
  readonly id: number;
  readonly accessToken: string;
  readonly threadsUserId: string;
  readonly obtainedAt: Date;
  readonly expiresInS: number;
}

export interface ThreadsOAuthTokenStorePort {
  upsert(input: ThreadsOAuthTokenUpsert): Promise<void>;
}

export const THREADS_OAUTH_TOKEN_STORE = 'THREADS_OAUTH_TOKEN_STORE';
