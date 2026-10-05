import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TargetDispatchResult } from '@/gateway/application/ports/target-dispatcher.port';

export interface ThreadsEnqueueInput {
  readonly botId: string;
  readonly chatId: string;
  readonly content: string;
  readonly clientMsgId?: string;
}

/**
 * HTTP client for the threads leg of `target/` (threads-publisher
 * plan Fase 2 todo 10).
 *
 * `threads` bindings do NOT publish in-process: they enqueue into
 * `apps/threads-publisher` (`POST /threads-publisher/queue/enqueue`,
 * dual-serve name `feed-threads-publisher/queue/enqueue` accepted)
 * which owns the Meta publish + scheduling. Base URL resolves flat
 * `THREADS_PUBLISHER_URL` first (default `http://localhost:4100`);
 * empty string = threads leg disabled (fail-closed
 * `THREADS_NOT_CONFIGURED`, the caller holds the plan — never throws
 * at construction so dashboard-only boot keeps working).
 */
@Injectable()
export class ThreadsPublisherHttpClient {
  private static readonly TIMEOUT_MS = 10_000;

  public constructor(@Optional() private readonly config?: ConfigService) {}

  public baseUrl(): string {
    try {
      const flat = this.config?.get<string>('THREADS_PUBLISHER_URL', '') ?? '';
      if (flat.trim()) return flat.trim().replace(/\/+$/, '');
    } catch {
      // fall through to the dev default below
    }
    return 'http://localhost:4100';
  }

  public isConfigured(): boolean {
    return this.baseUrl().length > 0;
  }

  public async enqueue(
    input: ThreadsEnqueueInput,
  ): Promise<TargetDispatchResult> {
    const base = this.baseUrl();
    if (!base) {
      return { ok: false, error: 'THREADS_NOT_CONFIGURED', held: false };
    }
    const body = JSON.stringify({
      channelId: input.chatId,
      messageId: Date.now(),
      content: input.content,
    });
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      ThreadsPublisherHttpClient.TIMEOUT_MS,
    );
    try {
      const res = await fetch(`${base}/threads-publisher/queue/enqueue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        return {
          ok: false,
          error: `threads-publisher enqueue failed (http ${res.status})`,
          held: false,
        };
      }
      const json = (await res.json().catch(() => null)) as {
        id?: unknown;
      } | null;
      const remoteId =
        json !== null && typeof json.id === 'string' && json.id
          ? json.id
          : (input.clientMsgId ?? `threads:${Date.now()}`);
      return { ok: true, remoteId };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : 'threads-publisher unreachable',
        held: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
