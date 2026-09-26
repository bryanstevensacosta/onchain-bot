import { Inject, Injectable, Optional } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';
import { SubscriptionRegistryService } from './subscription-registry.service';
import { IngressModeService } from './ingress-mode.service';
import { UpdateFanoutService } from './update-fanout.service';
import { VaultService } from '../../vault/application/vault.service';

export type PollerFetchFn = (
  url: string,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * getUpdates fallback poller (todo 3): ONLY runs when the route is in
 * `polling` mode (webhook impossible — e.g. no public URL). Starting it
 * while webhook owns the bot throws CONFLICT, so both can never run
 * together per bot. Polls `getUpdates` with an offset cursor and
 * forwards each update to the fan-out (same pass-through path as the
 * webhook receptor). Single-process loops; shared cursors land with
 * multi-replica deploy (todo 7).
 */
@Injectable()
export class UpdatePollerService {
  private readonly active = new Map<string, { stopped: boolean }>();
  private readonly offsets = new Map<string, number>();

  public constructor(
    private readonly registry: SubscriptionRegistryService,
    private readonly modes: IngressModeService,
    private readonly fanout: UpdateFanoutService,
    private readonly vault: VaultService,
    @Optional() @Inject('INGRESS_POLLER_FETCH_FN') fetchFn?: PollerFetchFn,
    @Optional()
    @Inject('INGRESS_POLLER_OPTS')
    private readonly opts?: { intervalMs?: number },
  ) {
    this.fetchFn =
      fetchFn ??
      (async (url: string) => {
        const res = await fetch(url);
        return {
          ok: res.ok,
          status: res.status,
          json: () => res.json() as Promise<unknown>,
        };
      });
  }

  private readonly fetchFn: PollerFetchFn;

  public isPolling(botId: string): boolean {
    return this.active.has(botId);
  }

  public async start(botId: string): Promise<void> {
    this.modes.assertPollingActive(botId);
    if (this.active.has(botId)) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `poller already running for bot ${botId}`,
        {
          botId,
        },
      );
    }
    const token = await this.vault.decryptToken(botId);
    const handle = { stopped: false };
    this.active.set(botId, handle);
    void this.loop(botId, token, handle);
  }

  public stop(botId: string): boolean {
    const handle = this.active.get(botId);
    if (!handle) return false;
    handle.stopped = true;
    this.active.delete(botId);
    return true;
  }

  private telegramBase(): string {
    return (
      (process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').trim() ||
      'https://api.telegram.org'
    );
  }

  private async loop(
    botId: string,
    token: string,
    handle: { stopped: boolean },
  ): Promise<void> {
    const intervalMs = this.opts?.intervalMs ?? 1000;
    while (!handle.stopped) {
      try {
        const offset = this.offsets.get(botId);
        const query = offset ? `?offset=${offset}&timeout=20` : '?timeout=20';
        const res = await this.fetchFn(
          `${this.telegramBase()}/bot${token}/getUpdates${query}`,
        );
        if (res.ok) {
          const body = (await res.json()) as {
            ok?: boolean;
            result?: Array<{ update_id: number } & Record<string, unknown>>;
          };
          const updates = Array.isArray(body.result) ? body.result : [];
          for (const update of updates) {
            if (handle.stopped) break;
            this.offsets.set(botId, update.update_id + 1);
            await this.fanout.fanout(botId, update);
          }
        }
      } catch {
        // Lossy poll tick: back off one interval, keep the cursor.
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
