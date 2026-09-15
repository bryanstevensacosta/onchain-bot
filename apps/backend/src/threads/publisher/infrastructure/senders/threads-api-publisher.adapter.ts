import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ThreadsApiPublisherPort,
  type ThreadsPublishInput,
  type ThreadsPublishResult,
} from 'threads/publisher/application/ports/threads-api-publisher.port';

interface ThreadsAppConfigShape {
  readonly threads?: {
    readonly accessToken?: string;
    readonly userId?: string;
  };
}

/**
 * Threads Graph API publisher adapter (TEXT-only MVP).
 *
 * Proven 2-step flow from `threads-meta-test/publish.mjs`:
 *   1. `POST /{uid}/threads { media_type: 'TEXT', text }` → container id
 *   2. Poll `GET /{cid}?fields=status` every 3s × up to 10 until FINISHED
 *   3. `POST /{uid}/threads_publish { creation_id }` → published media id
 *
 * Guards (never reject, mirror the spike):
 * - `text.length > 500` → truncate to 500 + append `…` (pre-publish).
 * - `imagePath(s)` present → log `media_skipped`, publish text-only.
 * - Missing/placeholder token (`''`, `FAKE`, `PASTE_ME`) → refuse WITHOUT
 *   any network call (red-ban: no `fetch('https://graph.threads.net*')`
 *   with fake/absent tokens).
 *
 * Error classification → FAILED with reason:
 * - 401/403 (auth) → NOT reintentable.
 * - 429 (rate-limit) / 5xx / network error → reintentable.
 * - Container `ERROR`/`EXPIRED`, other 4xx → NOT reintentable.
 * - Poll never reaches FINISHED → `TIMEOUT`, reintentable.
 *
 * Native fetch only, no new deps. Tokens are NEVER logged (masked `***`).
 */
@Injectable()
export class ThreadsApiPublisherAdapter extends ThreadsApiPublisherPort {
  private readonly logger = new Logger(ThreadsApiPublisherAdapter.name);
  private static readonly API_BASE = 'https://graph.threads.net/v1.0';
  private static readonly FETCH_TIMEOUT_MS = 10000;
  private static readonly TEXT_MAX_LENGTH = 500;

  private readonly accessToken: string;
  private readonly userId: string;

  /** Overridable in specs (keeps the 30s real poll out of unit tests). */
  public pollIntervalMs = 3000;
  public maxPollAttempts = 10;

  public constructor(private readonly configService: ConfigService) {
    super();
    const cfg = this.configService.get<ThreadsAppConfigShape>('app');
    this.accessToken = cfg?.threads?.accessToken ?? '';
    const uid = cfg?.threads?.userId ?? '';
    this.userId = uid.trim().length > 0 ? uid : 'me';
    if (!this.accessToken) {
      this.logger.warn(
        'ThreadsApiPublisherAdapter not configured ' +
          `(accessToken=***EMPTY***, userId=${this.userId}) — ` +
          `publish() will refuse without network until configured.`,
      );
    }
  }

  public static truncateForThreads(text: string): {
    text: string;
    truncated: boolean;
  } {
    if (text.length <= ThreadsApiPublisherAdapter.TEXT_MAX_LENGTH) {
      return { text, truncated: false };
    }
    return {
      text: `${text.slice(0, ThreadsApiPublisherAdapter.TEXT_MAX_LENGTH - 1)}…`,
      truncated: true,
    };
  }

  private static isPlaceholderToken(token: string): boolean {
    return token === '' || token === 'FAKE' || token === 'PASTE_ME';
  }

  private static classifyHttpFailure(
    status: number,
    body: string,
  ): { reason: string; reintentable: boolean } {
    if (status === 401 || status === 403) {
      return {
        reason: `Threads auth failed (status=${status}): ${body}`,
        reintentable: false,
      };
    }
    if (status === 429) {
      return {
        reason: `Threads rate limit (status=429): ${body}`,
        reintentable: true,
      };
    }
    if (status >= 500) {
      return {
        reason: `Threads transient failure (status=${status}): ${body}`,
        reintentable: true,
      };
    }
    return {
      reason: `Threads request failed (status=${status}): ${body}`,
      reintentable: false,
    };
  }

  public async publish(
    input: ThreadsPublishInput,
  ): Promise<ThreadsPublishResult> {
    if (ThreadsApiPublisherAdapter.isPlaceholderToken(this.accessToken)) {
      return {
        ok: false,
        status: 'FAILED',
        reason:
          'REFUSE Threads publish: missing or placeholder access token ' +
          '(skipped without network)',
        reintentable: false,
      };
    }
    if (!input.text || input.text.length === 0) {
      return {
        ok: false,
        status: 'FAILED',
        reason: 'REFUSE Threads publish: empty message',
        reintentable: false,
      };
    }
    const hasMedia =
      (input.imagePath !== undefined &&
        input.imagePath !== null &&
        input.imagePath.length > 0) ||
      (input.imagePaths !== undefined && input.imagePaths.length > 0);
    if (hasMedia) {
      this.logger.log(
        'media_skipped: Threads MVP is TEXT-only, publishing text without media',
      );
    }
    const prepared = ThreadsApiPublisherAdapter.truncateForThreads(input.text);
    const enc = encodeURIComponent;

    let containerId: string;
    try {
      const createUrl =
        `${ThreadsApiPublisherAdapter.API_BASE}/${enc(this.userId)}/threads` +
        `?access_token=${enc(this.accessToken)}`;
      const res = await fetch(createUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          media_type: 'TEXT',
          text: prepared.text,
        }),
        signal: AbortSignal.timeout(
          ThreadsApiPublisherAdapter.FETCH_TIMEOUT_MS,
        ),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: unknown };
      if (!res.ok) {
        const raw = JSON.stringify(json);
        const classified =
          ThreadsApiPublisherAdapter.classifyHttpFailure(res.status, raw);
        return { ok: false, status: 'FAILED', ...classified };
      }
      if (typeof json.id !== 'string' || json.id.length === 0) {
        return {
          ok: false,
          status: 'FAILED',
          reason: `Threads CREATE_FAILED: no container id body=${JSON.stringify(json)}`,
          reintentable: true,
        };
      }
      containerId = json.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      return {
        ok: false,
        status: 'FAILED',
        reason: `Threads CREATE_FAILED (network): ${message}`,
        reintentable: true,
      };
    }

    let status: string | null = null;
    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      try {
        const statusUrl =
          `${ThreadsApiPublisherAdapter.API_BASE}/${enc(containerId)}` +
          `?fields=status&access_token=${enc(this.accessToken)}`;
        const res = await fetch(statusUrl, {
          signal: AbortSignal.timeout(
            ThreadsApiPublisherAdapter.FETCH_TIMEOUT_MS,
          ),
        });
        const json = (await res.json().catch(() => ({}))) as {
          status?: unknown;
        };
        status = typeof json.status === 'string' ? json.status : null;
        if (status === 'FINISHED') break;
        if (status === 'ERROR' || status === 'EXPIRED') {
          return {
            ok: false,
            status: 'FAILED',
            reason: `Threads CONTAINER_FAILED id=${containerId} status=${status}`,
            reintentable: false,
          };
        }
      } catch (err) {
        this.logger.warn(
          `Threads poll attempt ${attempt}/${this.maxPollAttempts} ` +
            `error=${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }
    if (status !== 'FINISHED') {
      return {
        ok: false,
        status: 'FAILED',
        reason:
          `TIMEOUT container id=${containerId} ` +
          `status=${status ?? 'UNKNOWN'} after ${this.maxPollAttempts} attempts`,
        reintentable: true,
      };
    }

    try {
      const publishUrl =
        `${ThreadsApiPublisherAdapter.API_BASE}/${enc(this.userId)}/threads_publish` +
        `?access_token=${enc(this.accessToken)}`;
      const res = await fetch(publishUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ creation_id: containerId }),
        signal: AbortSignal.timeout(
          ThreadsApiPublisherAdapter.FETCH_TIMEOUT_MS,
        ),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: unknown };
      if (!res.ok) {
        const raw = JSON.stringify(json);
        const classified =
          ThreadsApiPublisherAdapter.classifyHttpFailure(res.status, raw);
        return { ok: false, status: 'FAILED', ...classified };
      }
      const remoteId = typeof json.id === 'string' ? json.id : containerId;
      this.logger.log(`Threads published id=${remoteId}`);
      return {
        ok: true,
        status: 'published',
        remoteId,
        text: prepared.text,
        truncated: prepared.truncated,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      return {
        ok: false,
        status: 'FAILED',
        reason: `Threads PUBLISH_FAILED (network): ${message}`,
        reintentable: true,
      };
    }
  }
}
