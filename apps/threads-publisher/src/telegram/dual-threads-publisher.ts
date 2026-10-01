import { Injectable } from '@nestjs/common';
import type {
  ThreadsPublishInput,
  ThreadsPublishResult,
} from 'threads/ports/threads-api-publisher.port';
import { ThreadsApiPublisherPort } from 'threads/ports/threads-api-publisher.port';
import { ThreadsApiPublisherAdapter } from 'threads/infrastructure/threads-api-publisher.adapter';
import { GatewaySendClient } from './gateway-send-client';
import { resolveThreadsPublishMode } from './publish-mode';

/**
 * Dual-run dispatcher: direct + gateway, compare outcome-only, return
 * the DIRECT leg (backend parity pattern). gateway mode is fail-closed.
 * Divergence is recorded; cutover asserts zero divergence (todo 11).
 */
@Injectable()
export class DualThreadsPublisher extends ThreadsApiPublisherPort {
  public readonly ledger: Array<{
    readonly mode: string;
    readonly outcome: string;
  }> = [];

  public constructor(
    private readonly direct: ThreadsApiPublisherAdapter,
    private readonly gateway: GatewaySendClient,
  ) {
    super();
  }

  public async publish(
    input: ThreadsPublishInput,
  ): Promise<ThreadsPublishResult> {
    const mode = resolveThreadsPublishMode();
    if (mode === 'direct') {
      return this.direct.publish(input);
    }
    const gatewayBotId = (process.env.THREADS_GATEWAY_BOT_ID ?? '').trim();
    if (mode === 'gateway') {
      if (!gatewayBotId) {
        return {
          ok: false,
          status: 'FAILED',
          reason: 'gateway mode: THREADS_GATEWAY_BOT_ID not configured',
          reintentable: false,
        };
      }
      const gw = await this.gateway.sendThreadsText({
        botId: gatewayBotId,
        text: input.text,
      });
      this.ledger.push({
        mode: 'gateway',
        outcome: gw.ok ? 'published' : `failed:${gw.reason ?? ''}`,
      });
      if (gw.ok) {
        return {
          ok: true,
          status: 'published',
          remoteId: gw.remoteId ?? 'gateway-ok',
          text: input.text,
          truncated: false,
        };
      }
      return {
        ok: false,
        status: 'FAILED',
        reason: gw.reason ?? 'gateway failed',
        reintentable: true,
      };
    }
    const directRes = await this.direct.publish(input);
    if (!gatewayBotId) {
      this.ledger.push({ mode: 'dual', outcome: 'skipped:no-bot-id' });
      return directRes;
    }
    const gw = await this.gateway.sendThreadsText({
      botId: gatewayBotId,
      text: input.text,
    });
    const match =
      (directRes.ok && gw.ok) || (!directRes.ok && !gw.ok)
        ? 'matched'
        : 'diverged';
    this.ledger.push({ mode: 'dual', outcome: match });
    return directRes;
  }

  public assertNoDivergence(): void {
    const diverged = this.ledger.filter((e) => e.outcome === 'diverged');
    if (diverged.length > 0) {
      throw new Error(
        `threads dual divergence: ${diverged.length} diverged (cutover blocked)`,
      );
    }
  }
}
