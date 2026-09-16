import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  THREADS_OAUTH_TOKEN_STORE,
  type ThreadsOAuthTokenStorePort,
} from 'threads/publisher/application/ports/threads-oauth-token-store.port';

interface ThreadsAppConfigShape {
  readonly threads?: {
    readonly accessToken?: string;
    readonly userId?: string;
  };
}

/**
 * Daily refresher for the long-lived (60-day) Threads user access token.
 *
 * Runs `@Cron('0 0 * * *')` (midnight):
 * - No `THREADS_ACCESS_TOKEN` (or placeholder `FAKE`/`PASTE_ME`) →
 *   `logger.warn('THREADS skipped: no token')` + return WITHOUT network.
 * - Else validate via `GET .../debug_token` (token masked as `***` in
 *   ALL logs), then `GET .../refresh_access_token?grant_type=th_refresh_token`
 *   when the token expires in < 7 days, and upsert `threads_oauth_tokens`
 *   (`id = 1`) through the injected store.
 *
 * The token is NEVER logged and NEVER persisted outside
 * `threads_oauth_tokens`. Native fetch only, no new deps.
 */
@Injectable()
export class ThreadsTokenRefresher {
  private readonly logger = new Logger(ThreadsTokenRefresher.name);
  private static readonly GRAPH_BASE = 'https://graph.threads.net';
  private static readonly FETCH_TIMEOUT_MS = 10000;
  /** Refresh when fewer than 7 days remain (mirrors the domain threshold). */
  private static readonly REFRESH_THRESHOLD_S = 7 * 24 * 60 * 60;

  public constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(THREADS_OAUTH_TOKEN_STORE)
    private readonly tokenStore?: ThreadsOAuthTokenStorePort,
  ) {}

  @Cron('0 0 * * *')
  public async handleCron(): Promise<void> {
    await this.refreshOnce();
  }

  public async refreshOnce(): Promise<{
    refreshed: boolean;
    reason: string;
  }> {
    const cfg = this.configService.get<ThreadsAppConfigShape>('app');
    const token = cfg?.threads?.accessToken ?? '';
    const userId = cfg?.threads?.userId?.trim() || 'me';
    if (
      token === '' ||
      token === 'FAKE' ||
      token === 'PASTE_ME' ||
      token.trim().length === 0
    ) {
      this.logger.warn('THREADS skipped: no token');
      return { refreshed: false, reason: 'skipped: no token' };
    }

    const enc = encodeURIComponent;
    let remainingS: number | null = null;
    try {
      const debugUrl =
        `${ThreadsTokenRefresher.GRAPH_BASE}/debug_token` +
        `?input_token=${enc(token)}&access_token=${enc(token)}`;
      const res = await fetch(debugUrl, {
        signal: AbortSignal.timeout(ThreadsTokenRefresher.FETCH_TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { expires_at?: unknown; expires_in?: unknown };
      };
      if (!res.ok) {
        this.logger.warn(
          `THREADS token validation failed status=${res.status} token=***`,
        );
        return { refreshed: false, reason: `validation failed: ${res.status}` };
      }
      const data = json.data;
      if (typeof data?.expires_at === 'number') {
        remainingS = data.expires_at - Math.floor(Date.now() / 1000);
      } else if (typeof data?.expires_in === 'number') {
        remainingS = data.expires_in;
      }
    } catch (err) {
      this.logger.warn(
        `THREADS token validation error token=*** ` +
          `error=${err instanceof Error ? err.message : 'unknown error'}`,
      );
      return { refreshed: false, reason: 'validation error' };
    }
    if (remainingS === null) {
      this.logger.warn(
        'THREADS token validation returned no expiry (token=***) — skipping refresh',
      );
      return { refreshed: false, reason: 'no expiry in debug_token' };
    }
    if (remainingS >= ThreadsTokenRefresher.REFRESH_THRESHOLD_S) {
      this.logger.log(
        `THREADS token valid, expires in ${Math.floor(remainingS / 86400)}d — refresh not due (token=***)`,
      );
      return { refreshed: false, reason: 'refresh not due' };
    }

    try {
      const refreshUrl =
        `${ThreadsTokenRefresher.GRAPH_BASE}/refresh_access_token` +
        `?grant_type=th_refresh_token&access_token=${enc(token)}`;
      const res = await fetch(refreshUrl, {
        signal: AbortSignal.timeout(ThreadsTokenRefresher.FETCH_TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => ({}))) as {
        access_token?: unknown;
        expires_in?: unknown;
      };
      if (!res.ok || typeof json.access_token !== 'string') {
        this.logger.warn(
          `THREADS token refresh failed status=${res.status} token=***`,
        );
        return { refreshed: false, reason: `refresh failed: ${res.status}` };
      }
      const expiresInS =
        typeof json.expires_in === 'number' && json.expires_in > 0
          ? json.expires_in
          : 5184000;
      if (this.tokenStore) {
        await this.tokenStore.upsert({
          id: 1,
          accessToken: json.access_token,
          threadsUserId: userId,
          obtainedAt: new Date(),
          expiresInS,
        });
        this.logger.log(
          'THREADS token refreshed and stored (threads_oauth_tokens id=1, token=***)',
        );
      } else {
        this.logger.warn(
          'THREADS token refreshed but no store wired — skipping persistence (token=***)',
        );
      }
      return { refreshed: true, reason: 'refreshed' };
    } catch (err) {
      this.logger.warn(
        `THREADS token refresh error token=*** ` +
          `error=${err instanceof Error ? err.message : 'unknown error'}`,
      );
      return { refreshed: false, reason: 'refresh error' };
    }
  }
}
