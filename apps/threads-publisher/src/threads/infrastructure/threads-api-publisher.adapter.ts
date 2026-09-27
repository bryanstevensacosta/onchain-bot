import { Injectable, Logger } from '@nestjs/common';
import { ThreadsApiPublisherPort } from '../ports/threads-api-publisher.port';
import type { ThreadsPublishInput, ThreadsPublishResult } from '../ports/threads-api-publisher.port';

/**
 * Direct Meta Threads adapter (TEXT-only MVP, backend parity).
 * 2-step: POST /{uid}/threads -> poll ?fields=status 3s x10 -> POST threads_publish.
 * Truncate 500 pre-publish; strip media + log media_skipped; FAKE refuses without network.
 *
 * @deprecated Direct leg only (dual-run with the gateway leg). Removed at
 * cutover (todo 11) — new sends go via telegram-bots-gateway vault ids.
 */
@Injectable()
export class ThreadsApiPublisherAdapter extends ThreadsApiPublisherPort {
  private readonly logger = new Logger(ThreadsApiPublisherAdapter.name);
  private static readonly API_BASE = 'https://graph.threads.net/v1.0';
  private static readonly FETCH_TIMEOUT_MS = 10000;
  public static readonly TEXT_MAX_LENGTH = 500;

  public pollIntervalMs = 3000;
  public maxPollAttempts = 10;

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

  private static token(): string {
    return (process.env.THREADS_ACCESS_TOKEN ?? '').trim();
  }

  private static userId(): string {
    const uid = (process.env.THREADS_USER_ID ?? '').trim();
    return uid.length > 0 ? uid : 'me';
  }

  private static isPlaceholder(token: string): boolean {
    return token === '' || token === 'FAKE' || token === 'PASTE_ME';
  }

  public async publish(
    input: ThreadsPublishInput,
  ): Promise<ThreadsPublishResult> {
    const token = ThreadsApiPublisherAdapter.token();
    if (ThreadsApiPublisherAdapter.isPlaceholder(token)) {
      return {
        ok: false,
        status: 'FAILED',
        reason:
          'REFUSE Threads publish: missing or placeholder access token (skipped without network)',
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
    const uid = ThreadsApiPublisherAdapter.userId();
    let containerId: string;
    try {
      const createUrl =
        `${ThreadsApiPublisherAdapter.API_BASE}/${enc(uid)}/threads` +
        `?access_token=${enc(token)}`;
      const res = await fetch(createUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ media_type: 'TEXT', text: prepared.text }),
        signal: AbortSignal.timeout(
          ThreadsApiPublisherAdapter.FETCH_TIMEOUT_MS,
        ),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: unknown };
      if (!res.ok) {
        return {
          ok: false,
          status: 'FAILED',
          reason: `Threads request failed (status=${res.status}): ${JSON.stringify(json)}`,
          reintentable: res.status === 429 || res.status >= 500,
        };
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
      return {
        ok: false,
        status: 'FAILED',
        reason: `Threads CREATE_FAILED (network): ${err instanceof Error ? err.message : 'unknown'}`,
        reintentable: true,
      };
    }
    let status: string | null = null;
    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt += 1) {
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      try {
        const statusUrl =
          `${ThreadsApiPublisherAdapter.API_BASE}/${enc(containerId)}` +
          `?fields=status&access_token=${enc(token)}`;
        const res = await fetch(statusUrl, {
          signal: AbortSignal.timeout(
            ThreadsApiPublisherAdapter.FETCH_TIMEOUT_MS,
          ),
        });
        const json = (await res.json().catch(() => ({}))) as {
          status?: unknown;
        };
        status = typeof json.status === 'string' ? json.status : null;
        if (status === 'FINISHED') {
          break;
        }
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
          `Threads poll attempt ${attempt}/${this.maxPollAttempts} error=${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }
    if (status !== 'FINISHED') {
      return {
        ok: false,
        status: 'FAILED',
        reason: `TIMEOUT container id=${containerId} status=${status ?? 'UNKNOWN'} after ${this.maxPollAttempts} attempts`,
        reintentable: true,
      };
    }
    try {
      const publishUrl =
        `${ThreadsApiPublisherAdapter.API_BASE}/${enc(uid)}/threads_publish` +
        `?access_token=${enc(token)}`;
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
        return {
          ok: false,
          status: 'FAILED',
          reason: `Threads request failed (status=${res.status}): ${JSON.stringify(json)}`,
          reintentable: res.status === 429 || res.status >= 500,
        };
      }
      const remoteId = typeof json.id === 'string' ? json.id : containerId;
      return {
        ok: true,
        status: 'published',
        remoteId,
        text: prepared.text,
        truncated: prepared.truncated,
      };
    } catch (err) {
      return {
        ok: false,
        status: 'FAILED',
        reason: `Threads PUBLISH_FAILED (network): ${err instanceof Error ? err.message : 'unknown'}`,
        reintentable: true,
      };
    }
  }
}
